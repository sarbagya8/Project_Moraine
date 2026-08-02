import { databaseError, zodDetails, zodMessage } from "@/lib/api-route-support";
import { trekkerAccessError } from "@/lib/api-auth";
import { failure, readJson, success, validationFailure } from "@/lib/api-response";
import { updateWithHardwareSchemaFallback } from "@/lib/database-schema";
import { checkRateLimit } from "@/lib/rate-limit";
import { logInfo, withRequestContext } from "@/lib/request-context";
import { getSupabaseServer } from "@/lib/supabase/server";
import { authorizedBridgeDevice, bridgeIdentitySchema } from "@/lib/trekker-device-bridge";

export const POST = withRequestContext("/api/trekker/device/verify", async (request, _route, context) => {
  const limit = checkRateLimit(request, "trekker-device-verify", 20, 60_000);
  if (!limit.allowed) return failure("RATE_LIMITED", `Retry in ${limit.retryAfter} seconds.`, 429);
  const authError = trekkerAccessError(request);
  if (authError) return authError;
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  const identity = bridgeIdentitySchema.safeParse(parsed.data);
  if (!identity.success) return validationFailure(zodMessage(identity.error), zodDetails(identity.error));
  try {
    const db = getSupabaseServer();
    const owner = await authorizedBridgeDevice(request, db, identity.data.deviceId);
    if (!owner) {
      logInfo(context, "ble.device_verification", {
        deviceId: identity.data.deviceId,
        verified: false,
      });
      return failure("UNAUTHORIZED_DEVICE", "This device is not assigned to your account.", 403);
    }
    if (identity.data.trekkerId && identity.data.trekkerId !== owner.trekkerId) {
      return failure("DEVICE_IDENTITY_MISMATCH", "The wristband identity does not match its server assignment.", 403);
    }
    const verifiedAt = new Date().toISOString();
    const enrichedUpdate: Record<string, string> = {
      last_verified_at: verifiedAt,
      last_seen_at: verifiedAt,
    };
    if (identity.data.firmwareVersion) {
      enrichedUpdate.firmware_version = identity.data.firmwareVersion;
    }
    const update = await updateWithHardwareSchemaFallback({
      enriched: () => db
        .from("devices")
        .update(enrichedUpdate)
        .eq("id", owner.deviceId)
        .eq("trekker_id", owner.trekkerId),
      legacy: () => db
        .from("devices")
        .update({ last_seen_at: verifiedAt })
        .eq("id", owner.deviceId)
        .eq("trekker_id", owner.trekkerId),
      context,
      operation: "verify ARGUS device",
      table: "devices",
    });
    logInfo(context, "ble.device_verification", {
      deviceId: owner.deviceId,
      deviceName: identity.data.deviceName ?? null,
      firmwareVersion: identity.data.firmwareVersion ?? null,
      identitySource: identity.data.identitySource,
      verified: true,
      hardwareSchemaReady: update.hardwareSchemaReady,
    });
    return success({
      verified: true,
      deviceName: identity.data.deviceName ?? null,
      deviceId: owner.deviceId,
      firmwareVersion: identity.data.firmwareVersion ?? null,
      identitySource: identity.data.identitySource,
      hardwareSchemaReady: update.hardwareSchemaReady,
    });
  } catch (error) { return databaseError(error, context); }
});
