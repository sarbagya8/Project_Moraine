import { authorityAccessError } from "@/lib/api-auth";
import { failure, success, validationFailure } from "@/lib/api-response";
import { withHardwareSchemaFallback } from "@/lib/database-schema";
import { ageSeconds } from "@/lib/map-links";
import { checkRateLimit } from "@/lib/rate-limit";
import { databaseError, zodDetails, zodMessage } from "@/lib/api-route-support";
import { withRequestContext } from "@/lib/request-context";
import { getSupabaseServer } from "@/lib/supabase/server";
import { rescueListQuerySchema } from "@/lib/validation/query-schema";
import { visibleCaseStatus } from "@/lib/portal-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RescueListEvent = {
  id: string;
  trekker_id: string;
  device_id: string | null;
  hardware_event_id: string | null;
  source: string;
  status: string;
  sms_status: string;
  severity_score: number | null;
  severity_label: string | null;
  severity_data_status: string | null;
  latitude: number | null;
  longitude: number | null;
  location_accuracy: number | null;
  location_captured_at: string | null;
  location_is_stale: boolean;
  heart_rate: number | null;
  spo2: number | null;
  altitude: number | null;
  temperature: number | null;
  sensor_state: string | null;
  reading_captured_at: string | null;
  reading_is_stale: boolean;
  symptom: string | null;
  map_url: string | null;
  rescue_url: string | null;
  created_at: string;
};

type LegacyRescueListEvent = Omit<
  RescueListEvent,
  "device_id" | "hardware_event_id" | "sensor_state"
>;

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
    const authError = authorityAccessError(request);
    if (authError) return authError;

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
      const enrichedEventQuery = () => {
        let query = db
          .from("sos_events")
          .select("id, trekker_id, device_id, hardware_event_id, source, status, sms_status, severity_score, severity_label, severity_data_status, latitude, longitude, location_accuracy, location_captured_at, location_is_stale, heart_rate, spo2, altitude, temperature, sensor_state, reading_captured_at, reading_is_stale, symptom, map_url, rescue_url, created_at");
        if (input.data.status) query = input.data.status === "new" ? query.in("status", ["active", "new"]) : query.eq("status", input.data.status);
        return query
          .order("created_at", { ascending: false })
          .limit(input.data.limit)
          .returns<RescueListEvent[]>();
      };
      const legacyEventQuery = () => {
        let query = db
          .from("sos_events")
          .select("id, trekker_id, source, status, sms_status, severity_score, severity_label, severity_data_status, latitude, longitude, location_accuracy, location_captured_at, location_is_stale, heart_rate, spo2, altitude, temperature, reading_captured_at, reading_is_stale, symptom, map_url, rescue_url, created_at");
        if (input.data.status) query = input.data.status === "new" ? query.in("status", ["active", "new"]) : query.eq("status", input.data.status);
        return query
          .order("created_at", { ascending: false })
          .limit(input.data.limit)
          .returns<LegacyRescueListEvent[]>();
      };
      const eventResult = await withHardwareSchemaFallback<
        RescueListEvent[],
        LegacyRescueListEvent[]
      >({
        enriched: enrichedEventQuery,
        legacy: legacyEventQuery,
        adaptLegacy: (rows) => (rows || []).map((event) => ({
          ...event,
          device_id: null,
          hardware_event_id: null,
          sensor_state: null,
        })),
        context,
        operation: "load rescue events",
        table: "sos_events",
      });

      const eventRows = eventResult.data ?? [];
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
        hardwareSchemaReady: eventResult.hardwareSchemaReady,
        events: eventRows.map((event) => {
          const trekker = trekkerById.get(event.trekker_id);
          return {
            id: event.id,
            trekkerId: event.trekker_id,
            trekkerName: trekker?.name || "Unknown user",
            route: trekker?.route_name || null,
            severityScore: event.severity_score,
            severityLabel: event.severity_label,
            severityDataStatus: event.severity_data_status,
            source: event.source,
            deviceId: event.device_id,
            hardwareEventId: event.hardware_event_id,
            status: visibleCaseStatus(event.status),
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
                    sensorState: event.sensor_state,
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
      return databaseError(error, context, { name: "load rescue list", table: "sos_events" });
    }
  },
);
