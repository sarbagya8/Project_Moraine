import {
  authorityAccessError,
  trekkerAccessError,
} from "@/lib/api-auth";
import { failure, readJson, success, validationFailure } from "@/lib/api-response";
import { SAFETY_DISCLAIMER } from "@/lib/disclaimer";
import { env } from "@/lib/env";
import { idempotencyKey } from "@/lib/idempotency";
import { checkRateLimit } from "@/lib/rate-limit";
import { databaseError, zodDetails, zodMessage } from "@/lib/api-route-support";
import { logInfo, withRequestContext } from "@/lib/request-context";
import { processSos, SosWorkflowError } from "@/lib/sos-service";
import { getSupabaseServer } from "@/lib/supabase/server";
import { sosSchema } from "@/lib/validation/sos-schema";

export const runtime = "nodejs";

function authorizationError(request: Request, source: string) {
  if (source === "physical_button") {
    return failure(
      "USE_TREKKER_DEVICE_BRIDGE",
      "Physical ARGUS SOS events must use the authenticated device bridge.",
      410,
    );
  }
  if (source === "manual") {
    return authorityAccessError(request);
  }
  if (source === "demo") {
    if (!env.demoMode) {
      return failure("DEMO_MODE_DISABLED", "Demo SOS requests are disabled.", 403);
    }
    return authorityAccessError(request);
  }
  return null;
}

export const POST = withRequestContext(
  "/api/sos",
  async (request, _routeContext, context) => {
    const rateLimit = checkRateLimit(request, "sos", 10, 60_000);
    if (!rateLimit.allowed) {
      return failure(
        "RATE_LIMITED",
        `Too many SOS requests. Retry in ${rateLimit.retryAfter} seconds.`,
        429,
      );
    }

    const parsed = await readJson(request);
    if (parsed.error) return parsed.error;
    const input = sosSchema.safeParse(parsed.data);
    if (!input.success) {
      return validationFailure(zodMessage(input.error), zodDetails(input.error));
    }
    if (
      (input.data.reading || input.data.location) &&
      input.data.source === "web_button"
    ) {
      return failure(
        "INLINE_TELEMETRY_NOT_ALLOWED",
        "Inline telemetry is accepted only from authenticated or demo SOS sources.",
        403,
      );
    }
    const authError = authorizationError(request, input.data.source);
    if (authError) return authError;
    if (input.data.source === "web_button") {
      const trekkerError = trekkerAccessError(request, input.data.trekkerId);
      if (trekkerError) return trekkerError;
    }

    try {
      const requestId = idempotencyKey(request, context.requestId);
      logInfo(context, "sos.confirmation_received", {
        idempotencyKey: requestId,
        trekkerId: input.data.trekkerId,
      });
      const result = await processSos(
        getSupabaseServer(),
        input.data,
        requestId,
        context,
      );
      return success(
        {
          ...result,
          created: !result.duplicate,
          sos: {
            ...result.event,
            trekkerId: input.data.trekkerId,
          },
          notificationStatus: result.event.notificationStatus,
          demoMode: env.demoMode,
          disclaimer: SAFETY_DISCLAIMER,
        },
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
