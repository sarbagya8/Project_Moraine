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
          enriched: () => db
            .from("devices")
            .select("id, is_active, last_seen_at, firmware_version")
            .eq("trekker_id", trekkerId)
            .maybeSingle(),
          legacy: () => db
            .from("devices")
            .select("id, is_active, last_seen_at")
            .eq("trekker_id", trekkerId)
            .maybeSingle(),
          adaptLegacy: (row) => row ? { ...row, firmware_version: null } : null,
          context,
          operation: "load trekker device",
          table: "devices",
        }),
        db
          .from("locations")
          .select("latitude, longitude, accuracy_meters, altitude, captured_at")
          .eq("trekker_id", trekkerId)
          .order("captured_at", { ascending: false })
          .limit(30),
        withHardwareSchemaFallback({
          enriched: () => db
            .from("sensor_readings")
            .select(
              "heart_rate, spo2, altitude, temperature, sensor_state, device_id, captured_at",
            )
            .eq("trekker_id", trekkerId)
            .order("captured_at", { ascending: false })
            .limit(20),
          legacy: () => db
            .from("sensor_readings")
            .select(
              "heart_rate, spo2, altitude, temperature, device_id, captured_at",
            )
            .eq("trekker_id", trekkerId)
            .order("captured_at", { ascending: false })
            .limit(20),
          adaptLegacy: (rows) => (rows || []).map((row) => ({ ...row, sensor_state: "valid" })),
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
