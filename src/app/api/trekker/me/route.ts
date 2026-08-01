import { failure, success } from "@/lib/api-response";
import { env } from "@/lib/env";
import { ageSeconds } from "@/lib/map-links";
import { requestSession } from "@/lib/portal-auth";
import { withRequestContext } from "@/lib/request-context";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const GET = withRequestContext(
  "/api/trekker/me",
  async (request) => {
  const session = requestSession(request);
  if (session?.role !== "trekker") {
    return failure("UNAUTHORIZED_TREKKER", "Trekker access is required.", 401);
  }
  try {
    const db = getSupabaseServer();
    const trekkerId = session.subject;
    const [profile, device, locations, readings, symptoms, emergencies] =
      await Promise.all([
        db
          .from("trekkers")
          .select("id, name, route_name, is_active")
          .eq("id", trekkerId)
          .eq("is_active", true)
          .maybeSingle(),
        db
          .from("devices")
          .select("id, is_active, last_seen_at")
          .eq("trekker_id", trekkerId)
          .maybeSingle(),
        db
          .from("locations")
          .select("latitude, longitude, accuracy_meters, altitude, captured_at")
          .eq("trekker_id", trekkerId)
          .order("captured_at", { ascending: false })
          .limit(30),
        db
          .from("sensor_readings")
          .select(
            "heart_rate, spo2, altitude, temperature, device_id, captured_at",
          )
          .eq("trekker_id", trekkerId)
          .order("captured_at", { ascending: false })
          .limit(20),
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
      device.error ||
      locations.error ||
      readings.error ||
      symptoms.error ||
      emergencies.error;
    if (error) throw error;
    if (!profile.data) {
      return failure("TREKKER_NOT_FOUND", "The trekker profile is unavailable.", 404);
    }
    const latestLocation = locations.data?.[0];
    const latestReading = readings.data?.[0];
    return success({
      generatedAt: new Date().toISOString(),
      freshness: {
        locationSeconds: env.locationStaleSeconds,
        readingSeconds: env.readingStaleSeconds,
      },
      trekker: {
        id: profile.data.id,
        name: profile.data.name,
        route: profile.data.route_name,
      },
      device: device.data
        ? {
            id: device.data.id,
            isActive: device.data.is_active,
            lastSeenAt: device.data.last_seen_at,
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
            heartRate: Number(latestReading.heart_rate),
            spo2: Number(latestReading.spo2),
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
      readingHistory: [...(readings.data || [])].reverse().map((row) => ({
        heartRate: Number(row.heart_rate),
        spo2: Number(row.spo2),
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
    const code = (error as { code?: string })?.code;
    if (code === "PGRST205" || code === "42P01") {
      return failure(
        "DATABASE_MIGRATIONS_REQUIRED",
        "The ARGUS database migrations have not been applied.",
        503,
      );
    }
    return failure(
      "DATABASE_ERROR",
      "Trekker data is temporarily unavailable.",
      503,
    );
  }
  },
);
