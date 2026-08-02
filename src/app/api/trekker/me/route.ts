import { failure, success } from "@/lib/api-response";
import { databaseError } from "@/lib/api-route-support";
import { withHardwareSchemaFallback } from "@/lib/database-schema";
import { env } from "@/lib/env";
import { ageSeconds } from "@/lib/map-links";
import { requestSession } from "@/lib/portal-auth";
import { withRequestContext } from "@/lib/request-context";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type TrekkerDeviceRow = {
  id: string;
  is_active: boolean;
  last_seen_at: string | null;
  firmware_version: string | null;
};
type LegacyTrekkerDeviceRow = Omit<TrekkerDeviceRow, "firmware_version">;

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

export const GET = withRequestContext(
  "/api/trekker/me",
  async (request, _routeContext, context) => {
  const session = requestSession(request);
  if (!session) return failure("UNAUTHENTICATED", "Sign in is required.", 401);
  if (session.role !== "trekker") {
    return failure("FORBIDDEN", "Trekker access is required.", 403);
  }
  try {
    const db = getSupabaseServer();
    const trekkerId = session.subject;
    const [profile, deviceResult, locations, readingsResult, symptoms, emergencies] =
      await Promise.all([
        db
          .from("trekkers")
          .select("id, name, route_name, is_active")
          .eq("id", trekkerId)
          .eq("is_active", true)
          .maybeSingle(),
        withHardwareSchemaFallback<TrekkerDeviceRow, LegacyTrekkerDeviceRow>({
          enriched: () => db.from("devices")
            .select("id, is_active, last_seen_at, firmware_version")
            .eq("trekker_id", trekkerId)
            .maybeSingle<TrekkerDeviceRow>(),
          legacy: () => db.from("devices")
            .select("id, is_active, last_seen_at")
            .eq("trekker_id", trekkerId)
            .maybeSingle<LegacyTrekkerDeviceRow>(),
          adaptLegacy: (row) => row ? { ...row, firmware_version: null } : null,
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
        db
          .from("symptom_reports")
          .select("id, symptom, severity, notes, created_at")
          .eq("trekker_id", trekkerId)
          .order("created_at", { ascending: false })
          .limit(10),
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
      profile.error ||
      locations.error ||
      symptoms.error ||
      emergencies.error;
    if (error) throw error;
    if (!profile.data) {
      return failure("TREKKER_NOT_FOUND", "The trekker profile is unavailable.", 404);
    }
    const latestLocation = locations.data?.[0];
    const device = deviceResult.data;
    const readings = readingsResult.data || [];
    const latestReading = readings[0];
    return success({
      generatedAt: new Date().toISOString(),
      hardwareSchemaReady:
        deviceResult.hardwareSchemaReady && readingsResult.hardwareSchemaReady,
      freshness: {
        locationSeconds: env.locationStaleSeconds,
        readingSeconds: env.readingStaleSeconds,
        deviceOnlineSeconds: env.deviceOnlineSeconds,
        deviceOfflineSeconds: env.deviceOfflineSeconds,
      },
      trekker: {
        id: profile.data.id,
        name: profile.data.name,
        route: profile.data.route_name,
      },
      device: device
        ? {
            id: device.id,
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
      latestReading: latestReading
        ? {
            heartRate: latestReading.heart_rate == null ? null : Number(latestReading.heart_rate),
            spo2: latestReading.spo2 == null ? null : Number(latestReading.spo2),
            sensorState: latestReading.sensor_state,
            altitude:
              latestReading.altitude == null
                ? null
                : Number(latestReading.altitude),
            temperature: latestReading.temperature == null ? null : Number(latestReading.temperature),
            pressure: latestReading.pressure == null ? null : Number(latestReading.pressure),
            startAltitude: latestReading.start_altitude == null ? null : Number(latestReading.start_altitude),
            currentAltitude: latestReading.current_altitude == null ? null : Number(latestReading.current_altitude),
            averageSpeed: latestReading.average_speed == null ? null : Number(latestReading.average_speed),
            distance: latestReading.distance == null ? null : Number(latestReading.distance),
            amsStatus: latestReading.ams_status,
            fallDetected: latestReading.fall_detected == null ? null : Boolean(latestReading.fall_detected),
            fallType: latestReading.fall_type,
            sosCountdown: latestReading.sos_countdown == null ? null : Boolean(latestReading.sos_countdown),
            physicalSos: latestReading.sos_active == null ? null : Boolean(latestReading.sos_active),
            deviceId: latestReading.device_id,
            capturedAt: latestReading.captured_at,
            ageSeconds: ageSeconds(latestReading.captured_at),
          }
        : null,
      readingHistory: [...readings].reverse().map((row) => ({
        heartRate: row.heart_rate == null ? null : Number(row.heart_rate),
        spo2: row.spo2 == null ? null : Number(row.spo2),
        sensorState: row.sensor_state,
        altitude: row.altitude == null ? null : Number(row.altitude),
        temperature: row.temperature == null ? null : Number(row.temperature),
        pressure: row.pressure == null ? null : Number(row.pressure),
        startAltitude: row.start_altitude == null ? null : Number(row.start_altitude),
        currentAltitude: row.current_altitude == null ? null : Number(row.current_altitude),
        averageSpeed: row.average_speed == null ? null : Number(row.average_speed),
        distance: row.distance == null ? null : Number(row.distance),
        amsStatus: row.ams_status,
        fallDetected: row.fall_detected == null ? null : Boolean(row.fall_detected),
        fallType: row.fall_type,
        sosCountdown: row.sos_countdown == null ? null : Boolean(row.sos_countdown),
        physicalSos: row.sos_active == null ? null : Boolean(row.sos_active),
        capturedAt: row.captured_at,
      })),
      symptoms: (symptoms.data || []).map((row) => ({
        id: row.id,
        symptom: row.symptom,
        severity: row.severity,
        notes: row.notes,
        createdAt: row.created_at,
      })),
      emergencies: (emergencies.data || []).map((row) => ({
        id: row.id,
        status: row.status,
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
