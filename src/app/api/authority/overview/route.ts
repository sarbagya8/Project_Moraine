import { authorityAccessError } from "@/lib/api-auth";
import { databaseError } from "@/lib/api-route-support";
import { success } from "@/lib/api-response";
import { withHardwareSchemaFallback, withHealthProfileSchemaFallback } from "@/lib/database-schema";
import { env } from "@/lib/env";
import { ageSeconds } from "@/lib/map-links";
import { withRequestContext } from "@/lib/request-context";
import { getSupabaseServer } from "@/lib/supabase/server";
import { visibleCaseStatus } from "@/lib/portal-api";
import { normalizeStoredReading } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

type SymptomRow = { trekker_id: string; symptom: string; severity: string; duration: string | null; notes: string | null; created_at: string };
type LegacySymptomRow = Omit<SymptomRow, "duration">;

export const GET = withRequestContext(
  "GET /api/authority/overview",
  async (request, _routeContext, context) => {
  const authError = authorityAccessError(request);
  if (authError) return authError;
  try {
    const db = getSupabaseServer();
    const [usersResult, devicesResult, eventsResult, attempts, locations, readingsResult, symptoms] =
      await Promise.all([
        withHealthProfileSchemaFallback({
          enriched: () => db.from("trekkers").select("id, email, name, mobile_number, emergency_contact, guide_mobile, route_name, blood_group, allergies, known_conditions, current_medications, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, secondary_emergency_contact_name, secondary_emergency_contact_phone, preferred_language, medical_notes, emergency_notes, date_of_birth, address, is_active, created_at, updated_at").order("name"),
          legacy: () => db.from("trekkers").select("id, name, mobile_number, emergency_contact, guide_mobile, route_name, blood_group, medical_notes, is_active, created_at, updated_at").order("name"),
          adaptLegacy: (rows) => (rows || []).map((row) => ({ ...row, email: null, allergies: null, known_conditions: null, current_medications: null, emergency_contact_name: null, emergency_contact_phone: row.emergency_contact, emergency_contact_relationship: null, secondary_emergency_contact_name: null, secondary_emergency_contact_phone: null, preferred_language: null, emergency_notes: null, date_of_birth: null, address: null })),
          context,
          operation: "load responder user profiles",
          table: "trekkers",
        }),
        withHardwareSchemaFallback({
          enriched: () => db.from("devices")
            .select("id, display_name, trekker_id, is_active, last_seen_at, firmware_version, created_at, updated_at"),
          legacy: () => db.from("devices")
            .select("id, trekker_id, is_active, last_seen_at, created_at, updated_at"),
          adaptLegacy: (rows) => (rows || []).map((row) => ({ ...row, display_name: null, firmware_version: null })),
          context,
          operation: "load authority devices",
          table: "devices",
        }),
        withHardwareSchemaFallback({
          enriched: () => db.from("sos_events")
            .select("id, trekker_id, device_id, hardware_event_id, source, status, sms_status, severity_score, severity_label, severity_data_status, latitude, longitude, location_accuracy, location_captured_at, location_is_stale, heart_rate, spo2, altitude, temperature, sensor_state, reading_captured_at, reading_is_stale, symptom, symptom_severity, symptom_notes, map_url, rescue_url, created_at, resolved_at")
            .neq("source", "demo")
            .order("created_at", { ascending: false })
            .limit(100),
          legacy: () => db.from("sos_events")
            .select("id, trekker_id, source, status, sms_status, severity_score, severity_label, severity_data_status, latitude, longitude, location_accuracy, location_captured_at, location_is_stale, heart_rate, spo2, altitude, temperature, reading_captured_at, reading_is_stale, symptom, symptom_severity, symptom_notes, map_url, rescue_url, created_at, resolved_at")
            .neq("source", "demo")
            .order("created_at", { ascending: false })
            .limit(100),
          adaptLegacy: (rows) => (rows || []).map((row) => ({
            ...row,
            device_id: null,
            hardware_event_id: null,
            sensor_state: null,
          })),
          context,
          operation: "load authority emergencies",
          table: "sos_events",
        }),
        db
          .from("sms_attempts")
          .select(
            "id, sos_event_id, phone_number, provider, status, provider_reference, error_message, created_at",
          )
          .order("created_at", { ascending: false })
          .not("provider", "in", "(demo,whatsapp_demo)")
          .limit(200),
        db
          .from("locations")
          .select("trekker_id, latitude, longitude, accuracy_meters, captured_at, source")
          .neq("source", "demo")
          .order("captured_at", { ascending: false })
          .limit(500),
        withHardwareSchemaFallback({
          enriched: () => db.from("sensor_readings")
            .select("trekker_id, device_id, heart_rate, spo2, altitude, temperature, pressure, start_altitude, current_altitude, average_speed, distance, ams_status, fall_detected, fall_type, sos_countdown, sos_active, sensor_state, captured_at, request_id")
            .not("request_id", "like", "argus-demo-reading-%")
            .order("captured_at", { ascending: false })
            .limit(500),
          legacy: () => db.from("sensor_readings")
            .select("trekker_id, device_id, heart_rate, spo2, altitude, temperature, captured_at, request_id")
            .not("request_id", "like", "argus-demo-reading-%")
            .order("captured_at", { ascending: false })
            .limit(500),
          adaptLegacy: (rows) => (rows || []).map((row) => ({
            ...row,
            pressure: null,
            start_altitude: null,
            current_altitude: null,
            average_speed: null,
            distance: null,
            ams_status: null,
            fall_detected: null,
            fall_type: null,
            sos_countdown: null,
            sos_active: null,
            sensor_state: null,
          })),
          context,
          operation: "load authority sensor readings",
          table: "sensor_readings",
        }),
        withHealthProfileSchemaFallback<SymptomRow[], LegacySymptomRow[]>({
          enriched: () => db.from("symptom_reports").select("trekker_id, symptom, severity, duration, notes, created_at").order("created_at", { ascending: false }).limit(200).returns<SymptomRow[]>(),
          legacy: () => db.from("symptom_reports").select("trekker_id, symptom, severity, notes, created_at").order("created_at", { ascending: false }).limit(200).returns<LegacySymptomRow[]>(),
          adaptLegacy: (rows) => (rows || []).map((row) => ({ ...row, duration: null })),
          context,
          operation: "load responder symptoms",
          table: "symptom_reports",
        }),
      ]);
    const error =
      attempts.error ||
      locations.error ||
      null;
    if (error) throw error;
    const devices = devicesResult.data || [];
    const events = eventsResult.data || [];
    const readings = readingsResult.data || [];

    const firstByTrekker = <T extends { trekker_id: string }>(rows: T[]) => {
      const map = new Map<string, T>();
      rows.forEach((row) => {
        if (!map.has(row.trekker_id)) map.set(row.trekker_id, row);
      });
      return map;
    };
    const latestLocation = firstByTrekker(locations.data || []);
    const latestReading = firstByTrekker(readings);
    const latestSymptom = firstByTrekker(symptoms.data || []);
    const readingsByTrekker = new Map<string, typeof readings>();
    const symptomsByTrekker = new Map<string, typeof symptoms.data>();
    for (const row of readings) {
      const history = readingsByTrekker.get(row.trekker_id) || [];
      history.push(row);
      readingsByTrekker.set(row.trekker_id, history);
    }
    for (const row of symptoms.data || []) {
      const history = symptomsByTrekker.get(row.trekker_id) || [];
      history.push(row);
      symptomsByTrekker.set(row.trekker_id, history);
    }
    const trekkerById = new Map((usersResult.data || []).map((row) => [row.id, row]));
    const deviceByTrekker = new Map(
      devices
        .filter((row) => row.trekker_id)
        .map((row) => [row.trekker_id as string, row]),
    );

    return success({
      generatedAt: new Date().toISOString(),
      hardwareSchemaReady:
        devicesResult.hardwareSchemaReady &&
        eventsResult.hardwareSchemaReady &&
        readingsResult.hardwareSchemaReady,
      healthProfileSchemaReady: usersResult.healthProfileSchemaReady,
      freshness: {
        locationSeconds: env.locationStaleSeconds,
        readingSeconds: env.readingStaleSeconds,
        deviceOnlineSeconds: env.deviceOnlineSeconds,
        deviceOfflineSeconds: env.deviceOfflineSeconds,
      },
      trekkers: (usersResult.data || []).map((row) => {
        const location = latestLocation.get(row.id);
        const reading = latestReading.get(row.id);
        const symptom = latestSymptom.get(row.id);
        const device = deviceByTrekker.get(row.id);
        return {
          id: row.id,
          email: row.email,
          name: row.name,
          route: row.route_name,
          mobileNumber: row.mobile_number,
          emergencyContact: row.emergency_contact,
          emergencyContactName: row.emergency_contact_name,
          emergencyContactPhone: row.emergency_contact_phone || row.emergency_contact,
          emergencyContactRelationship: row.emergency_contact_relationship,
          secondaryEmergencyContactName: row.secondary_emergency_contact_name,
          secondaryEmergencyContactPhone: row.secondary_emergency_contact_phone,
          preferredLanguage: row.preferred_language,
          guideMobile: row.guide_mobile,
          bloodGroup: row.blood_group,
          allergies: row.allergies,
          knownConditions: row.known_conditions,
          currentMedications: row.current_medications,
          dateOfBirth: row.date_of_birth,
          address: row.address,
          medicalNotes: row.medical_notes,
          emergencyNotes: row.emergency_notes,
          isActive: row.is_active,
          device: device
            ? {
                id: device.id,
                displayName: device.display_name,
                isActive: device.is_active,
                lastSeenAt: device.last_seen_at,
                firmwareVersion: device.firmware_version,
              }
            : null,
          latestLocation: location
            ? {
                latitude: Number(location.latitude),
                longitude: Number(location.longitude),
                accuracyMeters:
                  location.accuracy_meters == null
                    ? null
                    : Number(location.accuracy_meters),
                capturedAt: location.captured_at,
                ageSeconds: ageSeconds(location.captured_at),
              }
            : null,
          latestReading: reading ? normalizeStoredReading(reading) : null,
          latestSymptom: symptom
            ? {
                symptom: symptom.symptom,
                severity: symptom.severity,
                duration: symptom.duration,
                notes: symptom.notes,
                createdAt: symptom.created_at,
              }
            : null,
          readingHistory: (readingsByTrekker.get(row.id) || [])
            .slice(0, 20)
            .reverse()
            .map(normalizeStoredReading),
          symptoms: (symptomsByTrekker.get(row.id) || [])
            .slice(0, 10)
            .map((item) => ({
              symptom: item.symptom,
              severity: item.severity,
              duration: item.duration,
              notes: item.notes,
              createdAt: item.created_at,
            })),
        };
      }),
      devices: devices.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        trekkerId: row.trekker_id,
        trekkerName: row.trekker_id
          ? trekkerById.get(row.trekker_id)?.name || null
          : null,
        isActive: row.is_active,
        lastSeenAt: row.last_seen_at,
        firmwareVersion: row.firmware_version,
        createdAt: row.created_at,
      })),
      emergencies: events.map((row) => ({
        id: row.id,
        deviceId: row.device_id,
        hardwareEventId: row.hardware_event_id,
        trekkerId: row.trekker_id,
        trekkerName: trekkerById.get(row.trekker_id)?.name || "Unknown user",
        route: trekkerById.get(row.trekker_id)?.route_name || null,
        source: row.source,
        status: visibleCaseStatus(row.status),
        notificationStatus: row.sms_status,
        severityScore: row.severity_score,
        severityLabel: row.severity_label,
        severityDataStatus: row.severity_data_status,
        latitude: row.latitude == null ? null : Number(row.latitude),
        longitude: row.longitude == null ? null : Number(row.longitude),
        locationAccuracy:
          row.location_accuracy == null ? null : Number(row.location_accuracy),
        locationCapturedAt: row.location_captured_at,
        locationIsStale: row.location_is_stale,
        heartRate: row.heart_rate,
        spo2: row.spo2,
        altitude: row.altitude,
        temperature: row.temperature,
        readingCapturedAt: row.reading_captured_at,
        readingIsStale: row.reading_is_stale,
        sensorState: row.sensor_state,
        symptom: row.symptom,
        symptomSeverity: row.symptom_severity,
        symptomNotes: row.symptom_notes,
        mapUrl: row.map_url,
        rescueUrl: row.rescue_url,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at,
      })),
      notificationAttempts: (attempts.data || []).map((row) => {
        let provider = row.provider || "WhatsApp";
        if (row.provider === "whatsapp") provider = "WhatsApp";
        if (row.provider === "demo" || row.provider === "whatsapp_demo") {
          provider = "WhatsApp (simulated)";
        }

        return {
          id: row.id,
          sosEventId: row.sos_event_id,
          trekkerId:
            events.find((event) => event.id === row.sos_event_id)
              ?.trekker_id || null,
          recipient: row.phone_number
            ? `${row.phone_number.slice(0, 5)}••••${row.phone_number.slice(-3)}`
            : "Unavailable",
          provider,
          status: row.status,
          providerMessageId: row.provider_reference,
          error: row.error_message,
          createdAt: row.created_at,
        };
      }),
    });
  } catch (error) {
    return databaseError(error, context, { name: "load authority overview" });
  }
  },
);
