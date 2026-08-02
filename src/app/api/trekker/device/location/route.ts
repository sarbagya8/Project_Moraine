import { databaseError, zodDetails, zodMessage } from "@/lib/api-route-support";
import { trekkerAccessError } from "@/lib/api-auth";
import { failure, readJson, success, validationFailure } from "@/lib/api-response";
import { suppliedIdempotencyKey } from "@/lib/idempotency";
import { checkRateLimit } from "@/lib/rate-limit";
import { logInfo, withRequestContext } from "@/lib/request-context";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  authorizedBridgeDevice,
  bridgeLocationSchema,
  storeBridgeLocation,
} from "@/lib/trekker-device-bridge";

export const runtime = "nodejs";

export const POST = withRequestContext(
  "/api/trekker/device/location",
  async (request, _routeContext, context) => {
    const limit = checkRateLimit(request, "trekker-device-location", 120, 60_000);
    if (!limit.allowed) {
      return failure("RATE_LIMITED", `Retry in ${limit.retryAfter} seconds.`, 429);
    }
    const authError = trekkerAccessError(request);
    if (authError) return authError;
    const requestId = suppliedIdempotencyKey(request);
    if (!requestId) {
      return failure("IDEMPOTENCY_KEY_REQUIRED", "A valid idempotency key is required.", 400);
    }
    const parsed = await readJson(request);
    if (parsed.error) return parsed.error;
    const input = bridgeLocationSchema.safeParse(parsed.data);
    if (!input.success) {
      return validationFailure(zodMessage(input.error), zodDetails(input.error));
    }

    try {
      const db = getSupabaseServer();
      const owner = await authorizedBridgeDevice(request, db, input.data.deviceId);
      if (!owner) {
        return failure("UNAUTHORIZED_DEVICE", "This device is not assigned to your account.", 403);
      }
      const stored = await storeBridgeLocation(db, owner, input.data, requestId);
      logInfo(context, "ble.location_persisted", {
        deviceId: owner.deviceId,
        storedIdPresent: Boolean(stored.id),
        idempotentReplay: "idempotentReplay" in stored && stored.idempotentReplay,
      });
      return success(stored, 201);
    } catch (error) {
      return databaseError(error, context);
    }
  },
);
