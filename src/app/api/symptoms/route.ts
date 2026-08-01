import { failure, readJson, success, validationFailure } from "@/lib/api-response";
import { isAdminAuthorized, isTrekkerAuthorized } from "@/lib/api-auth";
import { SYMPTOM_DISCLAIMER } from "@/lib/disclaimer";
import { idempotencyKey, isUniqueViolation } from "@/lib/idempotency";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  activeTrekker,
  databaseError,
  zodDetails,
  zodMessage,
} from "@/lib/api-route-support";
import { withRequestContext } from "@/lib/request-context";
import { getSupabaseServer } from "@/lib/supabase/server";
import { symptomSchema } from "@/lib/validation/symptom-schema";

export const runtime = "nodejs";

export const POST = withRequestContext(
  "/api/symptoms",
  async (request, _routeContext, context) => {
    const rateLimit = checkRateLimit(request, "symptoms", 30, 10 * 60_000);
    if (!rateLimit.allowed) {
      return failure(
        "RATE_LIMITED",
        `Too many symptom reports. Retry in ${rateLimit.retryAfter} seconds.`,
        429,
      );
    }

    const parsed = await readJson(request);
    if (parsed.error) return parsed.error;
    const input = symptomSchema.safeParse(parsed.data);
    if (!input.success) {
      return validationFailure(zodMessage(input.error), zodDetails(input.error));
    }
    if (
      !isAdminAuthorized(request) &&
      !isTrekkerAuthorized(request, input.data.trekkerId)
    ) {
      return failure("UNAUTHORIZED", "You may report symptoms only for your own profile.", 401);
    }

    try {
      if (!(await activeTrekker(input.data.trekkerId))) {
        return failure("UNKNOWN_TREKKER", "The trekker was not found.", 404);
      }

      const { data, error } = await getSupabaseServer()
        .from("symptom_reports")
        .insert({
          trekker_id: input.data.trekkerId,
          symptom: input.data.symptom,
          severity: input.data.severity,
          notes: input.data.notes || null,
          request_id: idempotencyKey(request, context.requestId),
        })
        .select("id, created_at")
        .single<{ id: string; created_at: string }>();

      if (error) throw error;
      return success(
        {
          id: data.id,
          createdAt: data.created_at,
          disclaimer: SYMPTOM_DISCLAIMER,
        },
        201,
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        const key = idempotencyKey(request, context.requestId);
        const { data: existing, error: lookupError } = await getSupabaseServer()
          .from("symptom_reports")
          .select("id, created_at")
          .eq("request_id", key)
          .maybeSingle<{ id: string; created_at: string }>();
        if (!lookupError && existing) {
          return success({ id: existing.id, createdAt: existing.created_at, idempotentReplay: true, disclaimer: SYMPTOM_DISCLAIMER });
        }
      }
      return databaseError(error, context);
    }
  },
);
