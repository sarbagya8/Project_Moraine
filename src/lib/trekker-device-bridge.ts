import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  insertSensorReadingCompatible,
  withHardwareSchemaFallback,
} from "./database-schema";
import { requestSession } from "./portal-auth";
import type {
  bridgeLocationSchema,
  bridgeReadingSchema,
} from "./validation/ble-bridge-schema";
import type { z } from "zod";

export {
  bridgeIdentitySchema,
  bridgeLocationSchema,
  bridgeReadingSchema,
  bridgeSosSchema,
} from "./validation/ble-bridge-schema";

export type AuthorizedBridgeDevice = {
  deviceId: string;
  trekkerId: string;
};

export async function authorizedBridgeDevice(
  request: Request,
  db: SupabaseClient,
  deviceId: string,
): Promise<AuthorizedBridgeDevice | null> {
  const session = requestSession(request);
  if (session?.role !== "trekker") return null;

  const { data, error } = await db
    .from("devices")
    .select("id, trekker_id")
    .eq("id", deviceId)
    .eq("trekker_id", session.subject)
    .eq("is_active", true)
    .maybeSingle<{ id: string; trekker_id: string }>();
  if (error) throw error;
  return data ? { deviceId: data.id, trekkerId: data.trekker_id } : null;
}

export async function storeBridgeReading(
  db: SupabaseClient,
  owner: AuthorizedBridgeDevice,
  input: z.infer<typeof bridgeReadingSchema>,
  requestId: string,
) {
  const { data, error, hardwareSchemaReady } = await insertSensorReadingCompatible(db, {
      trekker_id: owner.trekkerId,
      device_id: owner.deviceId,
      heart_rate: input.heartRate,
      spo2: input.spo2,
      temperature: input.temperature,
      temperature_kind: input.temperatureType ?? null,
      altitude: input.altitude ?? null,
      sensor_state: input.sensorState,
      device_uptime_ms: input.deviceCapturedAtMs ?? null,
      pressure: input.pressure ?? null,
      start_altitude: input.startAltitude ?? null,
      current_altitude: input.currentAltitude ?? null,
      average_speed: input.averageSpeed ?? null,
      distance: input.distance ?? null,
      ams_status: input.amsStatus ?? null,
      fall_detected: input.fallDetected ?? false,
      fall_type: input.fallType ?? null,
      sos_countdown: input.sosCountdown ?? false,
      sos_active: input.sosActive ?? false,
      captured_at: input.capturedAt,
      request_id: requestId,
    });
  if (error && error.code !== "23505") throw error;

  let storedId = data?.id ?? null;
  if (!storedId) {
    const { data: existing, error: lookupError } = await db
      .from("sensor_readings")
      .select("id")
      .eq("request_id", requestId)
      .maybeSingle<{ id: string }>();
    if (lookupError) throw lookupError;
    storedId = existing?.id ?? null;
  }

  const serverSeenAt = new Date().toISOString();
  const { error: deviceError } = await db
    .from("devices")
    .update({ last_seen_at: serverSeenAt })
    .eq("id", owner.deviceId)
    .eq("trekker_id", owner.trekkerId)
    .eq("is_active", true);
  if (deviceError) throw deviceError;
  return {
    id: storedId,
    capturedAt: input.capturedAt,
    sensorState: input.sensorState,
    hardwareSchemaReady,
  };
}

export async function storeBridgeLocation(
  db: SupabaseClient,
  owner: AuthorizedBridgeDevice,
  input: z.infer<typeof bridgeLocationSchema>,
  requestId: string,
) {
  const location = {
    trekker_id: owner.trekkerId,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracy_meters: input.accuracyMeters ?? null,
    altitude: input.altitude ?? null,
    source: "browser",
    captured_at: input.capturedAt,
    request_id: requestId,
  };
  let result;
  try {
    result = await withHardwareSchemaFallback({
      enriched: () => db
        .from("locations")
        .insert({ ...location, device_id: owner.deviceId })
        .select("id")
        .single<{ id: string }>(),
      legacy: () => db
        .from("locations")
        .insert(location)
        .select("id")
        .single<{ id: string }>(),
      adaptLegacy: (row) => row,
      operation: "store browser location",
      table: "locations",
    });
  } catch (error) {
    if ((error as { code?: string })?.code !== "23505") throw error;
    const { data: existing, error: lookupError } = await db
      .from("locations")
      .select("id")
      .eq("request_id", requestId)
      .maybeSingle<{ id: string }>();
    if (lookupError) throw lookupError;
    return {
      id: existing?.id ?? null,
      capturedAt: input.capturedAt,
      idempotentReplay: true,
    };
  }
  const data = result.data;

  if (data?.id) {
    return {
      id: data.id,
      capturedAt: input.capturedAt,
      hardwareSchemaReady: result.hardwareSchemaReady,
    };
  }
  return {
    id: null,
    capturedAt: input.capturedAt,
    hardwareSchemaReady: result.hardwareSchemaReady,
  };
}
