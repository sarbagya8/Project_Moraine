import { failure, readJson, success, validationFailure } from "@/lib/api-response";
import { isDeviceAuthorized } from "@/lib/api-auth";
import { SENSOR_DISCLAIMER } from "@/lib/disclaimer";
import { insertSensorReadingCompatible } from "@/lib/database-schema";
import { env } from "@/lib/env";
import {
  idempotencyKey,
  isUniqueViolation,
  suppliedIdempotencyKey,
} from "@/lib/idempotency";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  activeTrekker,
  databaseError,
  zodDetails,
  zodMessage,
} from "@/lib/api-route-support";
import { withRequestContext } from "@/lib/request-context";
import { getSupabaseServer } from "@/lib/supabase/server";
import { readingSchema } from "@/lib/validation/reading-schema";

export const runtime = "nodejs";

export const POST = withRequestContext(
  "/api/readings",
  async (request, _routeContext, context) => {
    const rateLimit = checkRateLimit(request, "readings", 120, 60_000);
    if (!rateLimit.allowed) {
      return failure(
        "RATE_LIMITED",
        `Too many sensor uploads. Retry in ${rateLimit.retryAfter} seconds.`,
        429,
      );
    }

    if (!env.deviceApiKeyConfigured) {
      return failure(
        "DEVICE_AUTH_NOT_CONFIGURED",
        "Device authentication is not configured.",
        503,
      );
    }
    if (!isDeviceAuthorized(request)) {
      return failure(
        "UNAUTHORIZED_DEVICE",
        "A valid device API key is required.",
        401,
      );
    }
    if (!suppliedIdempotencyKey(request)) {
      return failure(
        "IDEMPOTENCY_KEY_REQUIRED",
        "A valid x-idempotency-key header is required.",
        400,
      );
    }

    const parsed = await readJson(request);
    if (parsed.error) return parsed.error;
    const input = readingSchema.safeParse(parsed.data);
    if (!input.success) {
      return validationFailure(zodMessage(input.error), zodDetails(input.error));
    }

    try {
      if (!(await activeTrekker(input.data.trekkerId))) {
        return failure("UNKNOWN_TREKKER", "The user was not found.", 404);
      }

      const { data: assignedDevice, error: deviceError } = await getSupabaseServer()
        .from("devices")
        .select("id")
        .eq("id", input.data.deviceId)
        .eq("trekker_id", input.data.trekkerId)
        .eq("is_active", true)
        .maybeSingle<{ id: string }>();
      if (deviceError) throw deviceError;
      if (!assignedDevice) {
        return failure(
          "UNAUTHORIZED_DEVICE",
          "This device is not assigned to the supplied user.",
          403,
        );
      }

      const { data, error, hardwareSchemaReady } = await insertSensorReadingCompatible(
        getSupabaseServer(),
        {
          trekker_id: input.data.trekkerId,
          device_id: input.data.deviceId,
          heart_rate: input.data.heartRate,
          spo2: input.data.spo2,
          altitude: input.data.altitude,
          temperature: input.data.temperature,
          temperature_kind: input.data.temperatureType ?? null,
          sensor_state: input.data.sensorState,
          device_uptime_ms: input.data.deviceCapturedAtMs ?? null,
          pressure: input.data.pressure ?? null,
          start_altitude: input.data.startAltitude ?? null,
          current_altitude: input.data.currentAltitude ?? null,
          average_speed: input.data.averageSpeed ?? null,
          distance: input.data.distance ?? null,
          ams_status: input.data.amsStatus ?? null,
          fall_detected: input.data.fallDetected ?? false,
          fall_type: input.data.fallType ?? null,
          sos_countdown: input.data.sosCountdown ?? false,
          sos_active: input.data.sosActive ?? false,
          captured_at: input.data.capturedAt,
          request_id: idempotencyKey(request, context.requestId),
        },
      );

      if (error) throw error;
      if (!data) throw new Error("READING_INSERT_INVALID_RESPONSE");
      await getSupabaseServer()
        .from("devices")
        .update({ last_seen_at: input.data.capturedAt })
        .eq("id", input.data.deviceId)
        .eq("is_active", true);
      return success(
        {
          id: data.id,
          capturedAt: input.data.capturedAt,
          hardwareSchemaReady,
          disclaimer: SENSOR_DISCLAIMER,
        },
        201,
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        const key = idempotencyKey(request, context.requestId);
        const { data: existing, error: lookupError } = await getSupabaseServer()
          .from("sensor_readings")
          .select("id, captured_at")
          .eq("request_id", key)
          .maybeSingle<{ id: string; captured_at: string }>();
        if (!lookupError && existing) {
          return success({ id: existing.id, capturedAt: existing.captured_at, idempotentReplay: true, disclaimer: SENSOR_DISCLAIMER });
        }
      }
      return databaseError(error, context);
    }
  },
);
