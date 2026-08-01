import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requestSession } from "./portal-auth";
import {
  bridgeLocationSchema,
  bridgeReadingSchema,
} from "./validation/ble-bridge-schema";

export {
  bridgeIdentitySchema,
  bridgeLocationSchema,
  bridgeReadingSchema,
  bridgeSosSchema,
} from "./validation/ble-bridge-schema";

export async function bridgeDeviceIsAuthorized(
  request: Request,
  db: SupabaseClient,
  expectedTrekkerId: string,
  expectedDeviceId: string,
) {
  const session = requestSession(request);
  if (session?.role !== "trekker" || session.subject !== expectedTrekkerId) {
    return false;
  }

  const { data, error } = await db
    .from("devices")
    .select("id")
    .eq("id", expectedDeviceId)
    .eq("trekker_id", expectedTrekkerId)
    .eq("is_active", true)
    .maybeSingle<{ id: string }>();
  if (error) throw error;
  return Boolean(data);
}

export async function storeBridgeReading(
  db: SupabaseClient,
  input: z.infer<typeof bridgeReadingSchema>,
  requestId: string,
) {
  const { data, error } = await db
    .from("sensor_readings")
    .insert({
      trekker_id: input.trekkerId,
      device_id: input.deviceId,
      heart_rate: input.heartRate,
      spo2: input.spo2,
      temperature: input.temperature,
      altitude: input.altitude ?? null,
      captured_at: input.capturedAt,
      request_id: requestId,
    })
    .select("id")
    .single<{ id: string }>();
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

  const { error: deviceError } = await db
    .from("devices")
    .update({ last_seen_at: input.capturedAt })
    .eq("id", input.deviceId)
    .eq("trekker_id", input.trekkerId)
    .eq("is_active", true);
  if (deviceError) throw deviceError;
  return { id: storedId, capturedAt: input.capturedAt };
}

export async function storeBridgeLocation(
  db: SupabaseClient,
  input: z.infer<typeof bridgeLocationSchema>,
  requestId: string,
) {
  const { data, error } = await db
    .from("locations")
    .insert({
      trekker_id: input.trekkerId,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy_meters: input.accuracyMeters ?? null,
      altitude: input.altitude ?? null,
      source: "browser",
      captured_at: input.capturedAt,
      request_id: requestId,
    })
    .select("id")
    .single<{ id: string }>();
  if (error && error.code !== "23505") throw error;

  if (data?.id) return { id: data.id, capturedAt: input.capturedAt };
  const { data: existing, error: lookupError } = await db
    .from("locations")
    .select("id")
    .eq("request_id", requestId)
    .maybeSingle<{ id: string }>();
  if (lookupError) throw lookupError;
  return { id: existing?.id ?? null, capturedAt: input.capturedAt };
}
