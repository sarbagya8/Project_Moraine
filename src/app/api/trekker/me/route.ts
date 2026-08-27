import { failure, success } from "@/lib/api-response";
import { databaseError } from "@/lib/api-route-support";
import { withHardwareSchemaFallback, withHealthProfileSchemaFallback } from "@/lib/database-schema";
import { env } from "@/lib/env";
import { ageSeconds } from "@/lib/map-links";
import { requestSession } from "@/lib/portal-auth";
import { withRequestContext } from "@/lib/request-context";
import { getSupabaseServer } from "@/lib/supabase/server";
import { visibleCaseStatus } from "@/lib/portal-api";
import { normalizeStoredReading } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

type TrekkerDeviceRow = {
  id: string;
  display_name: string | null;
  is_active: boolean;
  last_seen_at: string | null;
  firmware_version: string | null;
};
type LegacyTrekkerDeviceRow = Omit<TrekkerDeviceRow, "firmware_version" | "display_name">;

type TrekkerReadingRow = {
  heart_rate: number | null;
  spo2: number | null;
  altitude: number | null;
  temperature: number | null;
  pressure: number | null;
  start_altitude: number | null;
  current_altitude: number | null;
  average_speed: number | null;
  distance: number | null;
  ams_status: string | null;
  fall_detected: boolean | null;
  fall_type: string | null;
  sos_countdown: boolean | null;
  sos_active: boolean | null;
  sensor_state: string | null;
  device_id: string;
  captured_at: string;
  request_id: string | null;
};
type LegacyTrekkerReadingRow = Pick<
  TrekkerReadingRow,
  "heart_rate" | "spo2" | "altitude" | "temperature" | "device_id" | "captured_at" | "request_id"
>;

type UserProfileRow = {
  id: string;
  email: string | null;
  name: string;
  route_name: string | null;
  is_active: boolean;
  mobile_number: string | null;
  emergency_contact: string | null;
  blood_group: string | null;
  medical_notes: string | null;
  date_of_birth: string | null;
  address: string | null;
  allergies: string | null;
  known_conditions: string | null;
  current_medications: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_notes: string | null;
  emergency_contact_relationship: string | null;
  secondary_emergency_contact_name: string | null;
  secondary_emergency_contact_phone: string | null;
  preferred_language: string | null;
};

type LegacyUserProfileRow = Pick<UserProfileRow, "id" | "name" | "route_name" | "is_active" | "mobile_number" | "emergency_contact" | "blood_group" | "medical_notes">;
type SymptomRow = { id: string; symptom: string; severity: string; duration: string | null; notes: string | null; created_at: string };
type LegacySymptomRow = Omit<SymptomRow, "duration">;

export const GET = withRequestContext(
  "/api/trekker/me",
  async (request, _routeContext, context) => {
  const session = requestSession(request);
  if (!session) return failure("UNAUTHENTICATED", "Sign in is required.", 401);
  if (session.role !== "trekker") {
    return failure("FORBIDDEN", "User Portal access is required.", 403);
  }
  try {
    const db = getSupabaseServer();
    const trekkerId = session.subject;
    const [profileResult, deviceResult, locations, readingsResult, symptoms, emergencies] =
      await Promise.all([
        withHealthProfileSchemaFallback<UserProfileRow, LegacyUserProfileRow>({
          enriched: () => db.from("trekkers").select("id, email, name, route_name, is_active, mobile_number, emergency_contact, blood_group, medical_notes, date_of_birth, address, allergies, known_conditions, current_medications, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, secondary_emergency_contact_name, secondary_emergency_contact_phone, preferred_language, emergency_notes").eq("id", trekkerId).eq("is_active", true).maybeSingle<UserProfileRow>(),
          legacy: () => db.from("trekkers").select("id, name, route_name, is_active, mobile_number, emergency_contact, blood_group, medical_notes").eq("id", trekkerId).eq("is_active", true).maybeSingle<LegacyUserProfileRow>(),
          adaptLegacy: (row) => row ? { ...row, email: null, date_of_birth: null, address: null, allergies: null, known_conditions: null, current_medications: null, emergency_contact_name: null, emergency_contact_phone: row.emergency_contact, emergency_contact_relationship: null, secondary_emergency_contact_name: null, secondary_emergency_contact_phone: null, preferred_language: null, emergency_notes: null } : null,
          context,
          operation: "load user health profile",
          table: "trekkers",
        }),
        withHardwareSchemaFallback<TrekkerDeviceRow, LegacyTrekkerDeviceRow>({
          enriched: () => db.from("devices")
            .select("id, display_name, is_active, last_seen_at, firmware_version")
            .eq("trekker_id", trekkerId)
            .maybeSingle<TrekkerDeviceRow>(),
          legacy: () => db.from("devices")
            .select("id, is_active, last_seen_at")
            .eq("trekker_id", trekkerId)
            .maybeSingle<LegacyTrekkerDeviceRow>(),
          adaptLegacy: (row) => row ? { ...row, display_name: null, firmware_version: null } : null,
          context,
          operation: "load trekker device",
          table: "devices",
        }),
        db
          .from("locations")
          .select("latitude, longitude, accuracy_meters, altitude, captured_at")
          .eq("trekker_id", trekkerId)
          .neq("source", "demo")
          .order("captured_at", { ascending: false })
          .limit(30),
        withHardwareSchemaFallback<TrekkerReadingRow[], LegacyTrekkerReadingRow[]>({
          enriched: () => db.from("sensor_readings")
            .select("heart_rate, spo2, altitude, temperature, pressure, start_altitude, current_altitude, average_speed, distance, ams_status, fall_detected, fall_type, sos_countdown, sos_active, sensor_state, device_id, captured_at, request_id")
            .eq("trekker_id", trekkerId)
            .not("request_id", "like", "argus-demo-reading-%")
            .order("captured_at", { ascending: false })
            .limit(20),
          legacy: () => db.from("sensor_readings")
            .select("heart_rate, spo2, altitude, temperature, device_id, captured_at, request_id")
            .eq("trekker_id", trekkerId)
            .not("request_id", "like", "argus-demo-reading-%")
            .order("captured_at", { ascending: false })
            .limit(20),
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
          operation: "load trekker sensor readings",
          table: "sensor_readings",
        }),
        withHealthProfileSchemaFallback<SymptomRow[], LegacySymptomRow[]>({
          enriched: () => db.from("symptom_reports").select("id, symptom, severity, duration, notes, created_at").eq("trekker_id", trekkerId).order("created_at", { ascending: false }).limit(10).returns<SymptomRow[]>(),
          legacy: () => db.from("symptom_reports").select("id, symptom, severity, notes, created_at").eq("trekker_id", trekkerId).order("created_at", { ascending: false }).limit(10).returns<LegacySymptomRow[]>(),
          adaptLegacy: (rows) => (rows || []).map((row) => ({ ...row, duration: null })),
          context,
          operation: "load user symptoms",
          table: "symptom_reports",
        }),
        db
          .from("sos_events")
          .select(
            "id, status, sms_status, severity_score, severity_label, location_is_stale, reading_is_stale, rescue_url, created_at",
          )
          .eq("trekker_id", trekkerId)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
    const error =
      locations.error ||
      emergencies.error;
    if (error) throw error;
    if (!profileResult.data) {
      return failure("USER_NOT_FOUND", "The user profile is unavailable.", 404);
    }
    const latestLocation = locations.data?.[0];
    const device = deviceResult.data;
    const readings = readingsResult.data || [];
    const latestReading = readings[0];
    return success({
      generatedAt: new Date().toISOString(),
      hardwareSchemaReady:
        deviceResult.hardwareSchemaReady && readingsResult.hardwareSchemaReady,
      healthProfileSchemaReady: profileResult.healthProfileSchemaReady,
      freshness: {
        locationSeconds: env.locationStaleSeconds,
        readingSeconds: env.readingStaleSeconds,
        deviceOnlineSeconds: env.deviceOnlineSeconds,
        deviceOfflineSeconds: env.deviceOfflineSeconds,
      },
      trekker: {
        id: profileResult.data.id,
        email: profileResult.data.email,
        name: profileResult.data.name,
        route: profileResult.data.route_name,
        dateOfBirth: profileResult.data.date_of_birth,
        mobileNumber: profileResult.data.mobile_number,
        address: profileResult.data.address,
        bloodGroup: profileResult.data.blood_group,
        allergies: profileResult.data.allergies,
        knownConditions: profileResult.data.known_conditions,
        currentMedications: profileResult.data.current_medications,
        emergencyContactName: profileResult.data.emergency_contact_name,
        emergencyContactPhone: profileResult.data.emergency_contact_phone || profileResult.data.emergency_contact,
        emergencyContactRelationship: profileResult.data.emergency_contact_relationship,
        secondaryEmergencyContactName: profileResult.data.secondary_emergency_contact_name,
        secondaryEmergencyContactPhone: profileResult.data.secondary_emergency_contact_phone,
        preferredLanguage: profileResult.data.preferred_language,
        emergencyContact: profileResult.data.emergency_contact,
        healthNotes: profileResult.data.medical_notes,
        emergencyNotes: profileResult.data.emergency_notes,
      },
      device: device
        ? {
            id: device.id,
            displayName: device.display_name,
            isActive: device.is_active,
            lastSeenAt: device.last_seen_at,
            firmwareVersion: device.firmware_version,
          }
        : null,
      latestLocation: latestLocation
        ? {
            latitude: Number(latestLocation.latitude),
            longitude: Number(latestLocation.longitude),
            accuracyMeters:
              latestLocation.accuracy_meters == null
                ? null
                : Number(latestLocation.accuracy_meters),
            altitude:
              latestLocation.altitude == null
                ? null
                : Number(latestLocation.altitude),
            capturedAt: latestLocation.captured_at,
            ageSeconds: ageSeconds(latestLocation.captured_at),
          }
        : null,
      routeCoordinates: [...(locations.data || [])].reverse().map((row) => ({
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        accuracyMeters:
          row.accuracy_meters == null ? undefined : Number(row.accuracy_meters),
        capturedAt: row.captured_at,
      })),
      latestReading: latestReading ? normalizeStoredReading(latestReading) : null,
      readingHistory: [...readings].reverse().map(normalizeStoredReading),
      symptoms: (symptoms.data || []).map((row) => ({
        id: row.id,
        symptom: row.symptom,
        severity: row.severity,
        duration: row.duration,
        notes: row.notes,
        createdAt: row.created_at,
      })),
      emergencies: (emergencies.data || []).map((row) => ({
        id: row.id,
        status: visibleCaseStatus(row.status),
        notificationStatus: row.sms_status,
        severityScore: row.severity_score,
        severityLabel: row.severity_label,
        locationIsStale: row.location_is_stale,
        readingIsStale: row.reading_is_stale,
        rescueUrl: row.rescue_url,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    return databaseError(error, context, { name: "load trekker dashboard" });
  }
  },
);
