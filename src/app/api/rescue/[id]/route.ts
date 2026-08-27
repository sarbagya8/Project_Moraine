import { failure, readJson, success, validationFailure } from "@/lib/api-response";
import { authorityAccessError } from "@/lib/api-auth";
import { requestSession } from "@/lib/portal-auth";
import { SAFETY_DISCLAIMER } from "@/lib/disclaimer";
import { isCaseWorkflowMigrationError, withHardwareSchemaFallback, withHealthProfileSchemaFallback } from "@/lib/database-schema";
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
import { normalizeStoredReading, type StoredReading } from "@/lib/telemetry";
import { visibleCaseStatus } from "@/lib/portal-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

type RescueDetailEvent = {
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
  pressure: number | null;
  fall_detected: boolean | null;
  fall_type: string | null;
  sensor_state: string | null;
  reading_captured_at: string | null;
  reading_is_stale: boolean;
  symptom: string | null;
  symptom_severity: string | null;
  symptom_notes: string | null;
  map_url: string | null;
  rescue_url: string | null;
  created_at: string;
  resolved_at: string | null;
};

type LegacyRescueDetailEvent = Omit<
  RescueDetailEvent,
  "device_id" | "hardware_event_id" | "sensor_state" | "pressure" | "fall_detected" | "fall_type"
>;

type RescueSensorRow = StoredReading;
type LegacyRescueSensorRow = Pick<StoredReading, "device_id" | "heart_rate" | "spo2" | "altitude" | "temperature" | "captured_at">;

type HealthProfileRow = { name: string; route_name: string | null; blood_group: string | null; medical_notes: string | null; date_of_birth: string | null; allergies: string | null; known_conditions: string | null; current_medications: string | null; emergency_contact_name: string | null; emergency_contact_phone: string | null; emergency_contact: string | null; emergency_notes: string | null };
type LegacyHealthProfileRow = Pick<HealthProfileRow, "name" | "route_name" | "blood_group" | "medical_notes" | "emergency_contact">;
type SymptomRow = { symptom: string; severity: string; duration: string | null; notes: string | null; created_at: string };
type LegacySymptomRow = Omit<SymptomRow, "duration">;

export const GET = withRequestContext<RouteContext>(
  "/api/rescue/[id]",
  async (request, routeContext, context) => {
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
      const eventResult = await withHardwareSchemaFallback<
        RescueDetailEvent,
        LegacyRescueDetailEvent
      >({
        enriched: () => db
          .from("sos_events")
          .select(
            "id, trekker_id, device_id, hardware_event_id, source, status, sms_status, severity_score, severity_label, severity_data_status, latitude, longitude, location_accuracy, location_captured_at, location_is_stale, heart_rate, spo2, altitude, temperature, pressure, fall_detected, fall_type, sensor_state, reading_captured_at, reading_is_stale, symptom, symptom_severity, symptom_notes, map_url, rescue_url, created_at, resolved_at",
          )
          .eq("id", parsedId.data)
          .maybeSingle()
          .returns<RescueDetailEvent>(),
        legacy: () => db
          .from("sos_events")
          .select(
            "id, trekker_id, source, status, sms_status, severity_score, severity_label, severity_data_status, latitude, longitude, location_accuracy, location_captured_at, location_is_stale, heart_rate, spo2, altitude, temperature, reading_captured_at, reading_is_stale, symptom, symptom_severity, symptom_notes, map_url, rescue_url, created_at, resolved_at",
          )
          .eq("id", parsedId.data)
          .maybeSingle()
          .returns<LegacyRescueDetailEvent>(),
        adaptLegacy: (event) => event ? {
          ...event,
          device_id: null,
          hardware_event_id: null,
          sensor_state: null,
          pressure: null,
          fall_detected: null,
          fall_type: null,
        } : null,
        context,
        operation: "load rescue event",
        table: "sos_events",
      });
      const event = eventResult.data;
      if (!event) {
        return failure(
          "SOS_NOT_FOUND",
          "The Emergency Health Passport was not found.",
          404,
        );
      }
      const session = requestSession(request);
      if (!session) return failure("UNAUTHENTICATED", "Sign in is required to view this health information.", 401);
      if (session.role !== "authority" && (session.role !== "trekker" || session.subject !== event.trekker_id)) {
        return failure("FORBIDDEN", "You are not authorized to view this case.", 403);
      }

      const [trekkerResult, locationsResult, readingsResult, symptomsResult, attemptsResult] =
        await Promise.all([
          withHealthProfileSchemaFallback<HealthProfileRow, LegacyHealthProfileRow>({
            enriched: () => db.from("trekkers").select("name, route_name, blood_group, medical_notes, date_of_birth, allergies, known_conditions, current_medications, emergency_contact_name, emergency_contact_phone, emergency_contact, emergency_notes").eq("id", event.trekker_id).single<HealthProfileRow>(),
            legacy: () => db.from("trekkers").select("name, route_name, blood_group, medical_notes, emergency_contact").eq("id", event.trekker_id).single<LegacyHealthProfileRow>(),
            adaptLegacy: (row) => row ? { ...row, date_of_birth: null, allergies: null, known_conditions: null, current_medications: null, emergency_contact_name: null, emergency_contact_phone: row.emergency_contact, emergency_notes: null } : null,
            context,
            operation: "load emergency health profile",
            table: "trekkers",
          }),
          db
            .from("locations")
            .select("latitude, longitude, accuracy_meters, captured_at")
            .eq("trekker_id", event.trekker_id)
            .lte("captured_at", new Date().toISOString())
            .order("captured_at", { ascending: false })
            .limit(30),
          withHardwareSchemaFallback<RescueSensorRow[], LegacyRescueSensorRow[]>({
            enriched: () => db
              .from("sensor_readings")
              .select("device_id, heart_rate, spo2, altitude, temperature, pressure, start_altitude, current_altitude, average_speed, distance, ams_status, fall_detected, fall_type, sos_countdown, sos_active, sensor_state, captured_at")
              .eq("trekker_id", event.trekker_id)
              .order("captured_at", { ascending: false })
              .limit(20)
              .returns<RescueSensorRow[]>(),
            legacy: () => db
              .from("sensor_readings")
              .select("device_id, heart_rate, spo2, altitude, temperature, captured_at")
              .eq("trekker_id", event.trekker_id)
              .order("captured_at", { ascending: false })
              .limit(20)
              .returns<LegacyRescueSensorRow[]>(),
            adaptLegacy: (rows) => (rows || []).map((row) => ({ ...row, sensor_state: null, pressure: null, start_altitude: null, current_altitude: null, average_speed: null, distance: null, ams_status: null, fall_detected: null, fall_type: null, sos_countdown: null, sos_active: null })),
            context,
            operation: "load rescue sensor history",
            table: "sensor_readings",
          }),
          withHealthProfileSchemaFallback<SymptomRow[], LegacySymptomRow[]>({
            enriched: () => db.from("symptom_reports").select("symptom, severity, duration, notes, created_at").eq("trekker_id", event.trekker_id).order("created_at", { ascending: false }).limit(10).returns<SymptomRow[]>(),
            legacy: () => db.from("symptom_reports").select("symptom, severity, notes, created_at").eq("trekker_id", event.trekker_id).order("created_at", { ascending: false }).limit(10).returns<LegacySymptomRow[]>(),
            adaptLegacy: (rows) => (rows || []).map((row) => ({ ...row, duration: null })),
            context,
            operation: "load case symptoms",
            table: "symptom_reports",
          }),
          db
            .from("sms_attempts")
            .select("provider, status, provider_reference, error_message, created_at, sent_at, delivered_at, read_at, failed_at")
            .eq("sos_event_id", event.id)
            .order("created_at", { ascending: true }),
        ]);

      const relatedError =
        locationsResult.error ||
        attemptsResult.error;
      if (relatedError) throw relatedError;

      const locations = locationsResult.data || [];
      const readings = readingsResult.data || [];
      const symptoms = symptomsResult.data || [];
      const attempts = attemptsResult.data || [];

      const [lifecycleResult, caseEventsResult, deviceResult] = await Promise.all([
        db.from("sos_events").select("acknowledged_at, in_progress_at").eq("id", event.id).single(),
        db.from("case_events").select("id, event_type, status, note, actor, created_at").eq("sos_event_id", event.id).order("created_at", { ascending: true }),
        event.device_id
          ? db.from("devices").select("last_seen_at, is_active").eq("id", event.device_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      let caseWorkflowReady = true;
      if (lifecycleResult.error && !isCaseWorkflowMigrationError(lifecycleResult.error)) throw lifecycleResult.error;
      if (caseEventsResult.error && !isCaseWorkflowMigrationError(caseEventsResult.error)) throw caseEventsResult.error;
      if (lifecycleResult.error || caseEventsResult.error) caseWorkflowReady = false;
      if (deviceResult.error) throw deviceResult.error;

      const timeline = [
        ...(event.reading_captured_at ? [{
          timestamp: event.reading_captured_at,
          type: "sensor" as const,
          message: "Wearable context attached to the case",
        }] : []),
        ...(event.symptom && symptoms[0] ? [{
          timestamp: symptoms[0].created_at,
          type: "symptom" as const,
          message: `${event.symptom} reported (${event.symptom_severity || "unspecified"})`,
        }] : []),
        ...(event.location_captured_at ? [{
          timestamp: event.location_captured_at,
          type: "location" as const,
          message: "Location attached to the case",
        }] : []),
        {
          timestamp: event.created_at,
          type: "sos" as const,
          message: "SOS activated",
        },
        ...attempts.map((attempt) => ({
          timestamp: attempt.read_at || attempt.delivered_at || attempt.sent_at || attempt.failed_at || attempt.created_at,
          type: "notification" as const,
          message: `${attempt.provider || "WhatsApp"} alert ${attempt.status}`,
        })),
        ...(caseEventsResult.data || []).map((item) => ({
          timestamp: item.created_at,
          type: item.event_type === "responder_note" ? "note" as const : "status" as const,
          message: item.event_type === "responder_note"
            ? item.note || "Responder note added"
            : item.event_type === "case_created"
              ? "Emergency case created"
              : `Case marked ${(item.status || "updated").replaceAll("_", " ")}`,
          actor: item.actor,
        })),
        ...(event.resolved_at && !(caseEventsResult.data || []).length
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
        hardwareSchemaReady:
          eventResult.hardwareSchemaReady && readingsResult.hardwareSchemaReady,
        caseWorkflowReady,
        sos: {
          id: event.id,
          trekkerId: event.trekker_id,
          trekkerName: trekkerResult.data?.name || "Unknown user",
          route: trekkerResult.data?.route_name || null,
          dateOfBirth: trekkerResult.data?.date_of_birth || null,
          bloodGroup: trekkerResult.data?.blood_group || null,
          allergies: trekkerResult.data?.allergies || null,
          knownConditions: trekkerResult.data?.known_conditions || null,
          currentMedications: trekkerResult.data?.current_medications || null,
          emergencyContactName: trekkerResult.data?.emergency_contact_name || null,
          emergencyContactPhone: trekkerResult.data?.emergency_contact_phone || trekkerResult.data?.emergency_contact || null,
          emergencyNotes: trekkerResult.data?.emergency_notes || null,
          medicalNotes: trekkerResult.data?.medical_notes || null,
          activatedAt: event.created_at,
          resolvedAt: event.resolved_at,
          acknowledgedAt: lifecycleResult.data?.acknowledged_at || null,
          inProgressAt: lifecycleResult.data?.in_progress_at || null,
          source: event.source,
          deviceId: event.device_id,
          hardwareEventId: event.hardware_event_id,
          status: visibleCaseStatus(event.status),
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
          latestSensorReading: readings[0]
            ? { ...normalizeStoredReading(readings[0]), isStale: ageSeconds(readings[0].captured_at) > 120 }
            : null,
          caseSensorSnapshot: event.reading_captured_at
            ? {
                heartRate: event.heart_rate == null ? null : Number(event.heart_rate),
                spo2: event.spo2 == null ? null : Number(event.spo2),
                altitude: event.altitude == null ? null : Number(event.altitude),
                temperature: event.temperature == null ? null : Number(event.temperature),
                pressure: event.pressure == null ? null : Number(event.pressure),
                fallDetected: event.fall_detected,
                fallType: event.fall_type,
                capturedAt: event.reading_captured_at,
                isStale: event.reading_is_stale,
                sensorState: event.sensor_state,
              }
            : null,
          wearable: deviceResult.data
            ? { active: deviceResult.data.is_active, lastSeenAt: deviceResult.data.last_seen_at }
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
          ...normalizeStoredReading(reading),
        })),
        latestSymptom: symptoms[0]
          ? {
              symptom: symptoms[0].symptom,
              severity: symptoms[0].severity,
              duration: symptoms[0].duration,
              notes: symptoms[0].notes,
              createdAt: symptoms[0].created_at,
            }
          : null,
        notificationAttempts: attempts.map((attempt) => ({
          provider: attempt.provider,
          status: attempt.status,
          providerReference: attempt.provider_reference,
          failureReason: attempt.error_message,
          createdAt: attempt.created_at,
          sentAt: attempt.sent_at,
          deliveredAt: attempt.delivered_at,
          readAt: attempt.read_at,
          failedAt: attempt.failed_at,
        })),
        timeline,
        disclaimer: SAFETY_DISCLAIMER,
        view: "authenticated_full",
      });
    } catch (error) {
      return databaseError(error, context, { name: "load rescue detail", table: "sos_events" });
    }
  },
);

export const PATCH = withRequestContext<RouteContext>(
  "/api/rescue/[id]",
  async (request, routeContext, context) => {
    const authError = authorityAccessError(request);
    if (authError) return authError;

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
      const db = getSupabaseServer();
      const { data: existing, error: existingError } = await db
        .from("sos_events")
        .select("id, status")
        .eq("id", parsedId.data)
        .maybeSingle<{ id: string; status: string }>();
      if (existingError) throw existingError;
      if (!existing) return failure("SOS_NOT_FOUND", "The emergency case was not found.", 404);

      const current = visibleCaseStatus(existing.status);
      const next = input.data.status;
      const transitions: Record<string, string[]> = {
        new: ["acknowledged", "cancelled"],
        acknowledged: ["in_progress", "resolved", "cancelled"],
        in_progress: ["resolved", "cancelled"],
        resolved: [],
        cancelled: [],
      };
      if (current !== next && !transitions[current]?.includes(next)) {
        return failure("INVALID_CASE_TRANSITION", `A ${current.replaceAll("_", " ")} case cannot move to ${next.replaceAll("_", " ")}.`, 409);
      }

      if (input.data.note || next === "in_progress") {
        const workflowProbe = await db.from("case_events").select("id").limit(1);
        if (workflowProbe.error && isCaseWorkflowMigrationError(workflowProbe.error)) {
          return failure("CASE_WORKFLOW_UNAVAILABLE", "Case notes and in-progress handling are not enabled yet.", 503);
        }
        if (workflowProbe.error) throw workflowProbe.error;
      }

      const now = new Date().toISOString();
      const isClosed = ["resolved", "cancelled"].includes(next);
      let updateResult = await db
        .from("sos_events")
        .update({
          status: next,
          acknowledged_at: next === "acknowledged" ? now : undefined,
          in_progress_at: next === "in_progress" ? now : undefined,
          resolved_at: isClosed ? now : null,
        })
        .eq("id", parsedId.data)
        .eq("status", existing.status)
        .select("id, status, acknowledged_at, in_progress_at, resolved_at")
        .maybeSingle();
      if (updateResult.error && isCaseWorkflowMigrationError(updateResult.error)) {
        updateResult = await db
          .from("sos_events")
          .update({ status: next, resolved_at: isClosed ? now : null })
          .eq("id", parsedId.data)
          .eq("status", existing.status)
          .select("id, status, resolved_at")
          .maybeSingle();
      }
      if (updateResult.error) throw updateResult.error;
      if (!updateResult.data) return failure("CASE_CHANGED", "The case changed while this update was being saved. Refresh and try again.", 409);

      if (input.data.note) {
        const session = requestSession(request);
        const { error: noteError } = await db.from("case_events").insert({
          sos_event_id: parsedId.data,
          event_type: "responder_note",
          note: input.data.note,
          actor: session?.subject || "responder",
        });
        if (noteError) throw noteError;
      }
      return success({ event: { ...updateResult.data, status: visibleCaseStatus(updateResult.data.status) } });
    } catch (error) {
      return databaseError(error, context);
    }
  },
);
