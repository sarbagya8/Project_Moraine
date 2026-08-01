import { databaseError, zodDetails, zodMessage } from "@/lib/api-route-support";
import { failure, readJson, success, validationFailure } from "@/lib/api-response";
import { SAFETY_DISCLAIMER } from "@/lib/disclaimer";
import { env } from "@/lib/env";
import { suppliedIdempotencyKey } from "@/lib/idempotency";
import { checkRateLimit } from "@/lib/rate-limit";
import { withRequestContext } from "@/lib/request-context";
import { processSos, SosWorkflowError } from "@/lib/sos-service";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  bridgeDeviceIsAuthorized,
  bridgeSosSchema,
  storeBridgeLocation,
} from "@/lib/trekker-device-bridge";

export const runtime = "nodejs";

export const POST = withRequestContext(
  "/api/trekker/device/sos",
  async (request, _routeContext, context) => {
    const limit = checkRateLimit(request, "trekker-device-sos", 10, 60_000);
    if (!limit.allowed) {
      return failure("RATE_LIMITED", `Retry in ${limit.retryAfter} seconds.`, 429);
    }
    const parsed = await readJson(request);
    if (parsed.error) return parsed.error;
    const input = bridgeSosSchema.safeParse(parsed.data);
    if (!input.success) {
      return validationFailure(zodMessage(input.error), zodDetails(input.error));
    }
    if (suppliedIdempotencyKey(request) !== input.data.eventId) {
      return failure("INVALID_EVENT_ID", "The SOS event ID must be used as the idempotency key.", 400);
    }

    try {
      const db = getSupabaseServer();
      if (!(await bridgeDeviceIsAuthorized(request, db, input.data.trekkerId, input.data.deviceId))) {
        return failure("UNAUTHORIZED_DEVICE", "This device is not assigned to your account.", 403);
      }
      if (input.data.location) {
        await storeBridgeLocation(
          db,
          {
            ...input.data.location,
            trekkerId: input.data.trekkerId,
            deviceId: input.data.deviceId,
          },
          `${input.data.eventId.slice(0, 84)}:phone-location`,
        );
      }
      const result = await processSos(
        db,
        {
          trekkerId: input.data.trekkerId,
          deviceId: input.data.deviceId,
          source: "physical_button",
          reading: input.data.reading,
        },
        input.data.eventId,
        context,
      );
      return success(
        { ...result, demoMode: env.demoMode, disclaimer: SAFETY_DISCLAIMER },
        result.duplicate ? 200 : 201,
      );
    } catch (error) {
      if (error instanceof SosWorkflowError) {
        return failure(error.code, error.message, error.status);
      }
      return databaseError(error, context);
    }
  },
);
