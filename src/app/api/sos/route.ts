import {
  isAdminAuthorized,
  isDeviceAuthorized,
  isTrekkerAuthorized,
} from "@/lib/api-auth";
import { failure, readJson, success, validationFailure } from "@/lib/api-response";
import { SAFETY_DISCLAIMER } from "@/lib/disclaimer";
import { env } from "@/lib/env";
import { idempotencyKey, suppliedIdempotencyKey } from "@/lib/idempotency";
import { checkRateLimit } from "@/lib/rate-limit";
import { databaseError, zodDetails, zodMessage } from "@/lib/api-route-support";
import { withRequestContext } from "@/lib/request-context";
import { processSos, SosWorkflowError } from "@/lib/sos-service";
import { getSupabaseServer } from "@/lib/supabase/server";
import { sosSchema } from "@/lib/validation/sos-schema";

export const runtime = "nodejs";

function authorizationError(request: Request, source: string) {
  if (source === "physical_button") {
    if (!env.deviceApiKeyConfigured) {
      return failure(
        "DEVICE_AUTH_NOT_CONFIGURED",
        "Device authentication is not configured.",
        503,
      );
    }
    if (!isDeviceAuthorized(request)) {
      return failure(
        "UNAUTHORIZED_DEVICE",
        "A valid device API key is required for physical SOS requests.",
        401,
      );
    }
    if (!suppliedIdempotencyKey(request)) {
      return failure(
        "IDEMPOTENCY_KEY_REQUIRED",
        "A valid x-idempotency-key header is required for physical SOS requests.",
        400,
      );
    }
  }
  if (source === "manual") {
    if (!env.administrativeAuthConfigured) {
      return failure(
        "ADMIN_AUTH_NOT_CONFIGURED",
        "Administrative authentication is not configured.",
        503,
      );
    }
    if (!isAdminAuthorized(request)) {
      return failure(
        "UNAUTHORIZED_ADMIN",
        "A valid administrative API key is required.",
        401,
      );
    }
  }
  if (source === "demo") {
    if (!env.demoMode) {
      return failure("DEMO_MODE_DISABLED", "Demo SOS requests are disabled.", 403);
    }
    if (!isAdminAuthorized(request)) {
      return failure(
        "UNAUTHORIZED_ADMIN",
        "Authority access is required for demo SOS requests.",
        401,
      );
    }
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
    if (
      input.data.source === "web_button" &&
      !isTrekkerAuthorized(request, input.data.trekkerId)
    ) {
      return failure(
        "UNAUTHORIZED_TREKKER",
        "You may activate a web SOS only for your own profile.",
        401,
      );
    }

    try {
      const result = await processSos(
        getSupabaseServer(),
        input.data,
        idempotencyKey(request, context.requestId),
        context,
      );
      return success(
        {
          ...result,
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
