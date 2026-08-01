import { failure, readJson, success, validationFailure } from "@/lib/api-response";
import { isAdminAuthorized } from "@/lib/api-auth";
import { SAFETY_DISCLAIMER } from "@/lib/disclaimer";
import { env } from "@/lib/env";
import { ageSeconds } from "@/lib/map-links";
import {
  databaseError,
  zodDetails,
  zodMessage,
} from "@/lib/api-route-support";
import { withRequestContext } from "@/lib/request-context";
import { getSupabaseServer } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/query-schema";
import { updateSosStatusSchema } from "@/lib/validation/sos-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withRequestContext<RouteContext>(
  "/api/rescue/[id]",
  async (_request, routeContext, context) => {
    const { id } = await routeContext.params;
    const parsedId = uuidSchema.safeParse(id);
    if (!parsedId.success) {
      return validationFailure(
        zodMessage(parsedId.error),
        zodDetails(parsedId.error),
      );
    }

    try {
      const db = getSupabaseServer();
      const { data: event, error } = await db
        .from("sos_events")
        .select(
          "id, trekker_id, source, status, sms_status, severity_score, severity_label, severity_data_status, latitude, longitude, location_accuracy, location_captured_at, location_is_stale, heart_rate, spo2, altitude, temperature, reading_captured_at, reading_is_stale, symptom, symptom_severity, symptom_notes, map_url, rescue_url, created_at, resolved_at",
        )
        .eq("id", parsedId.data)
        .maybeSingle();

      if (error) throw error;
      if (!event) {
        return failure(
          "SOS_NOT_FOUND",
          "The Rescue Passport was not found.",
          404,
        );
      }

      const [trekkerResult, locationsResult, readingsResult, symptomsResult, attemptsResult] =
        await Promise.all([
          db
            .from("trekkers")
            .select("name, route_name, blood_group, medical_notes")
            .eq("id", event.trekker_id)
            .single(),
          db
            .from("locations")
            .select("latitude, longitude, accuracy_meters, captured_at")
            .eq("trekker_id", event.trekker_id)
            .lte("captured_at", new Date().toISOString())
            .order("captured_at", { ascending: false })
            .limit(30),
          db
            .from("sensor_readings")
            .select("heart_rate, spo2, altitude, temperature, captured_at")
            .eq("trekker_id", event.trekker_id)
            .order("captured_at", { ascending: false })
            .limit(20),
          db
            .from("symptom_reports")
            .select("symptom, severity, notes, created_at")
            .eq("trekker_id", event.trekker_id)
            .order("created_at", { ascending: false })
            .limit(10),
          db
            .from("sms_attempts")
            .select("provider, status, created_at")
            .eq("sos_event_id", event.id)
            .order("created_at", { ascending: true }),
        ]);

      const relatedError =
        trekkerResult.error ||
        locationsResult.error ||
        readingsResult.error ||
        symptomsResult.error ||
        attemptsResult.error;
      if (relatedError) throw relatedError;

      const locations = locationsResult.data || [];
      const readings = readingsResult.data || [];
      const symptoms = symptomsResult.data || [];
      const attempts = attemptsResult.data || [];

      const timeline = [
        ...readings.map((reading) => ({
          timestamp: reading.captured_at,
          type: "sensor" as const,
          message: `Sensor update recorded at ${
            reading.altitude == null
              ? "unknown altitude"
              : `${Math.round(Number(reading.altitude)).toLocaleString("en-US")} m`
          }`,
        })),
        ...symptoms.map((report) => ({
          timestamp: report.created_at,
          type: "symptom" as const,
          message: `${report.symptom} reported (${report.severity})`,
        })),
        ...locations.map((location) => ({
          timestamp: location.captured_at,
          type: "location" as const,
          message: "Location update recorded",
        })),
        {
          timestamp: event.created_at,
          type: "sos" as const,
          message: "SOS activated",
        },
        ...attempts.map((attempt) => ({
          timestamp: attempt.created_at,
          type: "notification" as const,
          message: `${attempt.provider || "WhatsApp"} alert ${attempt.status}`,
        })),
        ...(event.resolved_at
          ? [
              {
                timestamp: event.resolved_at,
                type: "status" as const,
                message: "SOS resolved",
              },
            ]
          : []),
      ].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      return success({
        sos: {
          id: event.id,
          trekkerId: event.trekker_id,
          trekkerName: trekkerResult.data?.name || "Unknown trekker",
          route: trekkerResult.data?.route_name || null,
          bloodGroup: trekkerResult.data?.blood_group || null,
          medicalNotes: trekkerResult.data?.medical_notes || null,
          activatedAt: event.created_at,
          resolvedAt: event.resolved_at,
          source: event.source,
          status: event.status,
          notificationStatus: event.sms_status,
          severityScore: event.severity_score,
          severityLabel: event.severity_label,
          severityDataStatus: event.severity_data_status,
          latitude: event.latitude,
          longitude: event.longitude,
          locationAccuracy: event.location_accuracy,
          locationCapturedAt: event.location_captured_at,
          locationAgeSeconds: event.location_captured_at
            ? ageSeconds(event.location_captured_at)
            : null,
          locationIsStale: event.location_is_stale,
          latestSensorReading:
            event.heart_rate != null || event.spo2 != null
              ? {
                  heartRate:
                    event.heart_rate == null ? null : Number(event.heart_rate),
                  spo2: event.spo2 == null ? null : Number(event.spo2),
                  altitude:
                    event.altitude == null ? null : Number(event.altitude),
                  temperature:
                    event.temperature == null
                      ? null
                      : Number(event.temperature),
                  capturedAt: event.reading_captured_at,
                  isStale: event.reading_is_stale,
                }
              : null,
          symptom: event.symptom,
          symptomSeverity: event.symptom_severity,
          symptomNotes: event.symptom_notes,
          mapUrl: event.map_url,
          rescueUrl: event.rescue_url,
        },
        routeCoordinates: [...locations]
          .reverse()
          .map((location) => ({
            latitude: Number(location.latitude),
            longitude: Number(location.longitude),
            accuracyMeters:
              location.accuracy_meters == null
                ? undefined
                : Number(location.accuracy_meters),
            capturedAt: location.captured_at,
          })),
        sensorHistory: [...readings].reverse().map((reading) => ({
          heartRate: Number(reading.heart_rate),
          spo2: Number(reading.spo2),
          altitude: Number(reading.altitude),
          temperature: reading.temperature == null ? null : Number(reading.temperature),
          capturedAt: reading.captured_at,
        })),
        latestSymptom: symptoms[0]
          ? {
              symptom: symptoms[0].symptom,
              severity: symptoms[0].severity,
              notes: symptoms[0].notes,
              createdAt: symptoms[0].created_at,
            }
          : null,
        notificationAttempts: attempts.map((attempt) => ({
          provider: attempt.provider,
          status: attempt.status,
          createdAt: attempt.created_at,
        })),
        timeline,
        disclaimer: SAFETY_DISCLAIMER,
      });
    } catch (error) {
      return databaseError(error, context);
    }
  },
);

export const PATCH = withRequestContext<RouteContext>(
  "/api/rescue/[id]",
  async (request, routeContext, context) => {
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

    const { id } = await routeContext.params;
    const parsedId = uuidSchema.safeParse(id);
    if (!parsedId.success) {
      return validationFailure(
        zodMessage(parsedId.error),
        zodDetails(parsedId.error),
      );
    }

    const parsed = await readJson(request);
    if (parsed.error) return parsed.error;
    const input = updateSosStatusSchema.safeParse(parsed.data);
    if (!input.success) {
      return validationFailure(zodMessage(input.error), zodDetails(input.error));
    }

    try {
      const isClosed = input.data.status === "resolved";
      const { data, error } = await getSupabaseServer()
        .from("sos_events")
        .update({
          status: input.data.status,
          resolved_at: isClosed ? new Date().toISOString() : null,
        })
        .eq("id", parsedId.data)
        .select("id, status, resolved_at")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return failure("SOS_NOT_FOUND", "The SOS event was not found.", 404);
      }
      return success({ event: data });
    } catch (error) {
      return databaseError(error, context);
    }
  },
);
