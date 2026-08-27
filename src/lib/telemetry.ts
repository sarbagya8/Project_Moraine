import { ageSeconds } from "./map-links";
import type { PortalReading } from "./portal-api";

export type StoredReading = {
  device_id: string;
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
  captured_at: string;
};

export function normalizeStoredReading(row: StoredReading): PortalReading {
  return {
    deviceId: row.device_id,
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
    ageSeconds: ageSeconds(row.captured_at),
  };
}

export type FreshnessState = "live" | "recent" | "stale" | "offline" | "unavailable";

export function freshnessState(
  timestamp: string | null | undefined,
  recentSeconds: number,
  offlineSeconds = recentSeconds * 4,
  now = Date.now(),
): FreshnessState {
  if (!timestamp) return "unavailable";
  const age = Math.max(0, (now - new Date(timestamp).getTime()) / 1000);
  if (!Number.isFinite(age)) return "unavailable";
  if (age <= Math.min(15, recentSeconds)) return "live";
  if (age <= recentSeconds) return "recent";
  if (age <= offlineSeconds) return "stale";
  return "offline";
}
