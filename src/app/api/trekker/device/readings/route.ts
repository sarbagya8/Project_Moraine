import { databaseError, zodDetails, zodMessage } from "@/lib/api-route-support";
import { failure, readJson, success, validationFailure } from "@/lib/api-response";
import { suppliedIdempotencyKey } from "@/lib/idempotency";
import { checkRateLimit } from "@/lib/rate-limit";
import { withRequestContext } from "@/lib/request-context";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  bridgeDeviceIsAuthorized,
  bridgeReadingSchema,
  storeBridgeReading,
} from "@/lib/trekker-device-bridge";

export const runtime = "nodejs";

export const POST = withRequestContext(
  "/api/trekker/device/readings",
  async (request, _routeContext, context) => {
    const limit = checkRateLimit(request, "trekker-device-readings", 120, 60_000);
    if (!limit.allowed) {
      return failure("RATE_LIMITED", `Retry in ${limit.retryAfter} seconds.`, 429);
    }
    const requestId = suppliedIdempotencyKey(request);
    if (!requestId) {
      return failure("IDEMPOTENCY_KEY_REQUIRED", "A valid idempotency key is required.", 400);
    }
    const parsed = await readJson(request);
    if (parsed.error) return parsed.error;
    const input = bridgeReadingSchema.safeParse(parsed.data);
    if (!input.success) {
      return validationFailure(zodMessage(input.error), zodDetails(input.error));
    }

    try {
      const db = getSupabaseServer();
      if (!(await bridgeDeviceIsAuthorized(request, db, input.data.trekkerId, input.data.deviceId))) {
        return failure("UNAUTHORIZED_DEVICE", "This device is not assigned to your account.", 403);
      }
      return success(await storeBridgeReading(db, input.data, requestId), 201);
    } catch (error) {
      return databaseError(error, context);
    }
  },
);
