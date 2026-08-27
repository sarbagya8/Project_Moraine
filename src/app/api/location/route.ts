import { failure, readJson, success, validationFailure } from "@/lib/api-response";
import { trekkerAccessError } from "@/lib/api-auth";
import {
  idempotencyKey,
  isUniqueViolation,
} from "@/lib/idempotency";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  activeTrekker,
  databaseError,
  zodDetails,
  zodMessage,
} from "@/lib/api-route-support";
import { withRequestContext } from "@/lib/request-context";
import { getSupabaseServer } from "@/lib/supabase/server";
import { locationSchema } from "@/lib/validation/location-schema";

export const runtime = "nodejs";

export const POST = withRequestContext(
  "/api/location",
  async (request, _routeContext, context) => {
    const rateLimit = checkRateLimit(request, "location", 90, 60_000);
    if (!rateLimit.allowed) {
      return failure(
        "RATE_LIMITED",
        `Too many location uploads. Retry in ${rateLimit.retryAfter} seconds.`,
        429,
      );
    }

    const parsed = await readJson(request);
    if (parsed.error) return parsed.error;
    const input = locationSchema.safeParse(parsed.data);
    if (!input.success) {
      return validationFailure(zodMessage(input.error), zodDetails(input.error));
    }

    if (input.data.source === "device") {
      return failure(
        "USE_TREKKER_DEVICE_BRIDGE",
        "ARGUS locations come from authenticated browser geolocation, not the ESP32.",
        410,
      );
    } else if (input.data.source === "browser") {
      const authError = trekkerAccessError(request, input.data.trekkerId);
      if (authError) return authError;
    }

    try {
      if (!(await activeTrekker(input.data.trekkerId))) {
        return failure("UNKNOWN_TREKKER", "The user was not found.", 404);
      }

      const { data, error } = await getSupabaseServer()
        .from("locations")
        .insert({
          trekker_id: input.data.trekkerId,
          latitude: input.data.latitude,
          longitude: input.data.longitude,
          accuracy_meters: input.data.accuracyMeters ?? null,
          altitude: input.data.altitude ?? null,
          source: input.data.source,
          captured_at: input.data.capturedAt,
          request_id: idempotencyKey(request, context.requestId),
        })
        .select("id")
        .single<{ id: string }>();

      if (error) throw error;
      return success(
        { id: data.id, capturedAt: input.data.capturedAt },
        201,
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        const key = idempotencyKey(request, context.requestId);
        const { data: existing, error: lookupError } = await getSupabaseServer()
          .from("locations")
          .select("id, captured_at")
          .eq("request_id", key)
          .maybeSingle<{ id: string; captured_at: string }>();
        if (!lookupError && existing) {
          return success({ id: existing.id, capturedAt: existing.captured_at, idempotentReplay: true });
        }
      }
      return databaseError(error, context);
    }
  },
);
