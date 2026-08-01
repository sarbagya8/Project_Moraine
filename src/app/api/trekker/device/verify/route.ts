import { databaseError, zodDetails, zodMessage } from "@/lib/api-route-support";
import { failure, readJson, success, validationFailure } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/rate-limit";
import { withRequestContext } from "@/lib/request-context";
import { getSupabaseServer } from "@/lib/supabase/server";
import { bridgeDeviceIsAuthorized, bridgeIdentitySchema } from "@/lib/trekker-device-bridge";

export const POST = withRequestContext("/api/trekker/device/verify", async (request, _route, context) => {
  const limit = checkRateLimit(request, "trekker-device-verify", 20, 60_000);
  if (!limit.allowed) return failure("RATE_LIMITED", `Retry in ${limit.retryAfter} seconds.`, 429);
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  const identity = bridgeIdentitySchema.safeParse(parsed.data);
  if (!identity.success) return validationFailure(zodMessage(identity.error), zodDetails(identity.error));
  try {
    const authorized = await bridgeDeviceIsAuthorized(request, getSupabaseServer(), identity.data.trekkerId, identity.data.deviceId);
    if (!authorized) return failure("UNAUTHORIZED_DEVICE", "This device is not assigned to your account.", 403);
    return success({ verified: true, deviceId: identity.data.deviceId });
  } catch (error) { return databaseError(error, context); }
});
