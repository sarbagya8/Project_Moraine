import { isAdminAuthorized } from "@/lib/api-auth";
import { failure, success, validationFailure } from "@/lib/api-response";
import { env } from "@/lib/env";
import { ageSeconds } from "@/lib/map-links";
import { checkRateLimit } from "@/lib/rate-limit";
import { databaseError, zodDetails, zodMessage } from "@/lib/api-route-support";
import { withRequestContext } from "@/lib/request-context";
import { getSupabaseServer } from "@/lib/supabase/server";
import { rescueListQuerySchema } from "@/lib/validation/query-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRequestContext(
  "/api/rescue",
  async (request, _routeContext, context) => {
    const rateLimit = checkRateLimit(request, "rescue-list", 120, 60_000);
    if (!rateLimit.allowed) {
      return failure(
        "RATE_LIMITED",
        `Too many rescue-dashboard requests. Retry in ${rateLimit.retryAfter} seconds.`,
        429,
      );
    }
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

    const url = new URL(request.url);
    const input = rescueListQuerySchema.safeParse({
      status: url.searchParams.get("status") || undefined,
      limit: url.searchParams.get("limit") || undefined,
    });
    if (!input.success) {
      return validationFailure(zodMessage(input.error), zodDetails(input.error));
    }

    try {
      const db = getSupabaseServer();
      let query = db
        .from("sos_events")
        .select(
          "id, trekker_id, source, status, sms_status, severity_score, severity_label, severity_data_status, latitude, longitude, location_accuracy, location_captured_at, location_is_stale, heart_rate, spo2, altitude, temperature, reading_captured_at, reading_is_stale, symptom, map_url, rescue_url, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(input.data.limit);
      if (input.data.status) query = query.eq("status", input.data.status);
      const { data: events, error } = await query;
      if (error) throw error;

      const eventRows = events ?? [];
      const trekkerIds = [...new Set(eventRows.map((event) => event.trekker_id))];
      const eventIds = eventRows.map((event) => event.id);
      const [trekkerResult, attemptResult] = await Promise.all([
        trekkerIds.length
          ? db
              .from("trekkers")
              .select("id, name, route_name")
              .in("id", trekkerIds)
          : Promise.resolve({ data: [], error: null }),
        eventIds.length
          ? db
              .from("sms_attempts")
              .select("sos_event_id, provider, status, created_at")
              .in("sos_event_id", eventIds)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (trekkerResult.error) throw trekkerResult.error;
      if (attemptResult.error) throw attemptResult.error;
      const trekkerById = new Map(
        (trekkerResult.data ?? []).map((trekker) => [trekker.id, trekker]),
      );

      return success({
        events: eventRows.map((event) => {
          const trekker = trekkerById.get(event.trekker_id);
          return {
            id: event.id,
            trekkerId: event.trekker_id,
            trekkerName: trekker?.name || "Unknown trekker",
            route: trekker?.route_name || null,
            severityScore: event.severity_score,
            severityLabel: event.severity_label,
            severityDataStatus: event.severity_data_status,
            source: event.source,
            status: event.status,
            notificationStatus: event.sms_status,
            symptom: event.symptom,
            latitude: event.latitude,
            longitude: event.longitude,
            locationAccuracy: event.location_accuracy,
            locationCapturedAt: event.location_captured_at,
            locationAgeSeconds: event.location_captured_at
              ? ageSeconds(event.location_captured_at)
              : null,
            locationIsStale: event.location_is_stale,
            latestSensorReading:
              event.reading_captured_at == null
                ? null
                : {
                    heartRate: event.heart_rate,
                    spo2: event.spo2,
                    altitude: event.altitude,
                    temperature: event.temperature,
                    capturedAt: event.reading_captured_at,
                    isStale: event.reading_is_stale,
                  },
            mapUrl: event.map_url,
            rescueUrl: event.rescue_url,
            activatedAt: event.created_at,
            notificationAttempts: (attemptResult.data ?? [])
              .filter((attempt) => attempt.sos_event_id === event.id)
              .map((attempt) => ({
                provider: attempt.provider,
                status: attempt.status,
                createdAt: attempt.created_at,
              })),
          };
        }),
      });
    } catch (error) {
      return databaseError(error, context);
    }
  },
);
