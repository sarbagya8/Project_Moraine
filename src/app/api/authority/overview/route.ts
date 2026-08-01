import { isAdminAuthorized } from "@/lib/api-auth";
import { databaseError } from "@/lib/api-route-support";
import { failure, success } from "@/lib/api-response";
import { env } from "@/lib/env";
import { ageSeconds } from "@/lib/map-links";
import { withRequestContext } from "@/lib/request-context";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const GET = withRequestContext(
  "GET /api/authority/overview",
  async (request, _routeContext, context) => {
  if (!isAdminAuthorized(request)) {
    return failure("UNAUTHORIZED_ADMIN", "Authority access is required.", 401);
  }
  try {
    const db = getSupabaseServer();
    const [trekkers, devices, events, attempts, locations, readings, symptoms] =
      await Promise.all([
        db
          .from("trekkers")
          .select(
            "id, name, mobile_number, emergency_contact, guide_mobile, route_name, blood_group, medical_notes, is_active, created_at, updated_at",
          )
          .order("name"),
        db
          .from("devices")
          .select("id, trekker_id, is_active, last_seen_at, created_at, updated_at"),
        db
          .from("sos_events")
          .select(
            "id, trekker_id, source, status, sms_status, severity_score, severity_label, severity_data_status, latitude, longitude, location_accuracy, location_captured_at, location_is_stale, heart_rate, spo2, altitude, temperature, reading_captured_at, reading_is_stale, symptom, symptom_severity, symptom_notes, map_url, rescue_url, created_at, resolved_at",
          )
          .order("created_at", { ascending: false })
          .limit(100),
        db
          .from("sms_attempts")
          .select(
            "id, sos_event_id, phone_number, provider, status, provider_reference, error_message, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(200),
        db
          .from("locations")
          .select("trekker_id, latitude, longitude, accuracy_meters, captured_at")
          .order("captured_at", { ascending: false })
          .limit(500),
        db
          .from("sensor_readings")
          .select(
            "trekker_id, device_id, heart_rate, spo2, altitude, temperature, captured_at",
          )
          .order("captured_at", { ascending: false })
          .limit(500),
        db
          .from("symptom_reports")
          .select("trekker_id, symptom, severity, notes, created_at")
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
    const error =
      trekkers.error ||
      devices.error ||
      events.error ||
      attempts.error ||
      locations.error ||
      readings.error ||
      symptoms.error;
    if (error) throw error;

    const firstByTrekker = <T extends { trekker_id: string }>(rows: T[]) => {
      const map = new Map<string, T>();
      rows.forEach((row) => {
        if (!map.has(row.trekker_id)) map.set(row.trekker_id, row);
      });
      return map;
    };
    const latestLocation = firstByTrekker(locations.data || []);
    const latestReading = firstByTrekker(readings.data || []);
    const latestSymptom = firstByTrekker(symptoms.data || []);
    const readingsByTrekker = new Map<string, typeof readings.data>();
    const symptomsByTrekker = new Map<string, typeof symptoms.data>();
    for (const row of readings.data || []) {
      const history = readingsByTrekker.get(row.trekker_id) || [];
      history.push(row);
      readingsByTrekker.set(row.trekker_id, history);
    }
    for (const row of symptoms.data || []) {
      const history = symptomsByTrekker.get(row.trekker_id) || [];
      history.push(row);
      symptomsByTrekker.set(row.trekker_id, history);
    }
    const trekkerById = new Map((trekkers.data || []).map((row) => [row.id, row]));
    const deviceByTrekker = new Map(
      (devices.data || [])
        .filter((row) => row.trekker_id)
        .map((row) => [row.trekker_id as string, row]),
    );

    return success({
      generatedAt: new Date().toISOString(),
      freshness: {
        locationSeconds: env.locationStaleSeconds,
        readingSeconds: env.readingStaleSeconds,
      },
      trekkers: (trekkers.data || []).map((row) => {
        const location = latestLocation.get(row.id);
        const reading = latestReading.get(row.id);
        const symptom = latestSymptom.get(row.id);
        const device = deviceByTrekker.get(row.id);
        return {
          id: row.id,
          name: row.name,
          route: row.route_name,
          mobileNumber: row.mobile_number,
          emergencyContact: row.emergency_contact,
          guideMobile: row.guide_mobile,
          bloodGroup: row.blood_group,
          medicalNotes: row.medical_notes,
          isActive: row.is_active,
          device: device
            ? {
                id: device.id,
                isActive: device.is_active,
                lastSeenAt: device.last_seen_at,
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
          latestReading: reading
            ? {
                deviceId: reading.device_id,
                heartRate: Number(reading.heart_rate),
                spo2: Number(reading.spo2),
                altitude:
                  reading.altitude == null ? null : Number(reading.altitude),
                temperature: reading.temperature == null ? null : Number(reading.temperature),
                capturedAt: reading.captured_at,
                ageSeconds: ageSeconds(reading.captured_at),
              }
            : null,
          latestSymptom: symptom
            ? {
                symptom: symptom.symptom,
                severity: symptom.severity,
                notes: symptom.notes,
                createdAt: symptom.created_at,
              }
            : null,
          readingHistory: (readingsByTrekker.get(row.id) || [])
            .slice(0, 20)
            .reverse()
            .map((item) => ({
              deviceId: item.device_id,
              heartRate: Number(item.heart_rate),
              spo2: Number(item.spo2),
              altitude: item.altitude == null ? null : Number(item.altitude),
              temperature: item.temperature == null ? null : Number(item.temperature),
              capturedAt: item.captured_at,
              ageSeconds: ageSeconds(item.captured_at),
            })),
          symptoms: (symptomsByTrekker.get(row.id) || [])
            .slice(0, 10)
            .map((item) => ({
              symptom: item.symptom,
              severity: item.severity,
              notes: item.notes,
              createdAt: item.created_at,
            })),
        };
      }),
      devices: (devices.data || []).map((row) => ({
        id: row.id,
        trekkerId: row.trekker_id,
        trekkerName: row.trekker_id
          ? trekkerById.get(row.trekker_id)?.name || null
          : null,
        isActive: row.is_active,
        lastSeenAt: row.last_seen_at,
        createdAt: row.created_at,
      })),
      emergencies: (events.data || []).map((row) => ({
        id: row.id,
        trekkerId: row.trekker_id,
        trekkerName: trekkerById.get(row.trekker_id)?.name || "Unknown trekker",
        route: trekkerById.get(row.trekker_id)?.route_name || null,
        source: row.source,
        status: row.status,
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
            (events.data || []).find((event) => event.id === row.sos_event_id)
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
    return databaseError(error, context);
  }
  },
);
