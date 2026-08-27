import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";
import {
  insertSensorReadingCompatible,
  isHardwareMigrationError,
  updateWithHardwareSchemaFallback,
  withHardwareSchemaFallback,
} from "./database-schema";
import type { NotificationResult } from "./notification";
import { aggregateNotificationStatus } from "./notification";
import { ageSeconds } from "./map-links";
import { visibleCaseStatus } from "./portal-api";
import type { RequestContext } from "./request-context";
import { logInfo, logWarning } from "./request-context";
import {
  buildSosMessage,
  calculateSeverity,
  locationStatus,
  rescueUrl,
} from "./sos-rules";
import type { sosSchema } from "./validation/sos-schema";
import {
  configuredWhatsAppRecipient,
  sendWhatsAppSosAlert,
  type SosTemplateValues,
} from "./whatsapp";
import type { z } from "zod";

type SosInput = z.infer<typeof sosSchema>;

type RpcRow = {
  event_id: string;
  is_duplicate: boolean;
};

type LatestValidReading = {
  heart_rate: number | null;
  spo2: number | null;
  altitude: number | null;
  temperature: number | null;
  sensor_state: string | null;
  captured_at: string;
};

type LegacyLatestValidReading = Omit<LatestValidReading, "sensor_state">;
type LatestSensorState = Pick<LatestValidReading, "sensor_state" | "captured_at">;
type LegacyLatestSensorState = Pick<LatestValidReading, "captured_at">;

export class SosWorkflowError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function nonAtomicDevelopmentFallback(
  db: SupabaseClient,
  input: {
    trekkerId: string;
    source: string;
    cooldownSeconds: number;
    requestId: string;
  },
) {
  const { data: byRequest, error: requestError } = await db
    .from("sos_events")
    .select("id")
    .eq("request_id", input.requestId)
    .maybeSingle<{ id: string }>();
  if (requestError) throw requestError;
  if (byRequest) return { eventId: byRequest.id, duplicate: true };

  const { data: recent, error: recentError } = await db
    .from("sos_events")
    .select("id")
    .eq("trekker_id", input.trekkerId)
    .in("status", ["active", "new", "acknowledged", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (recentError) throw recentError;
  if (recent) return { eventId: recent.id, duplicate: true };

  const { data: created, error: createError } = await db
    .from("sos_events")
    .insert({
      trekker_id: input.trekkerId,
      source: input.source,
      request_id: input.requestId,
    })
    .select("id")
    .single<{ id: string }>();
  if (createError) throw createError;
  return { eventId: created.id, duplicate: false };
}

export async function createSosEventIfAllowed(
  db: SupabaseClient,
  input: {
    trekkerId: string;
    source: string;
    cooldownSeconds: number;
    requestId: string;
  },
  context: RequestContext,
) {
  const { data, error } = await db.rpc("create_sos_event_if_allowed", {
    p_trekker_id: input.trekkerId,
    p_source: input.source,
    p_cooldown_seconds: input.cooldownSeconds,
    p_request_id: input.requestId,
  });

  if (!error) {
    const row = (Array.isArray(data) ? data[0] : data) as RpcRow | null;
    if (!row?.event_id) throw new Error("SOS_RPC_INVALID_RESPONSE");
    return { eventId: row.event_id, duplicate: row.is_duplicate };
  }

  const missingRpc =
    error.code === "PGRST202" ||
    error.code === "42883" ||
    error.message?.includes("create_sos_event_if_allowed");
  if (!missingRpc) throw error;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SOS_RPC_REQUIRED");
  }

  logWarning(context, "sos.atomic_function_missing", {
    action: "development_fallback",
  });
  return nonAtomicDevelopmentFallback(db, input);
}

async function storeInlineTelemetry(
  db: SupabaseClient,
  input: SosInput,
  requestId: string,
) {
  if (input.reading) {
    const { error } = await insertSensorReadingCompatible(db, {
      trekker_id: input.trekkerId,
      device_id: input.reading.deviceId,
      heart_rate: input.reading.heartRate,
      spo2: input.reading.spo2,
      altitude: input.reading.altitude ?? null,
      temperature: input.reading.temperature,
      temperature_kind: input.reading.temperatureType ?? null,
      sensor_state: input.reading.sensorState,
      device_uptime_ms: input.reading.deviceCapturedAtMs ?? null,
      pressure: input.reading.pressure ?? null,
      start_altitude: input.reading.startAltitude ?? null,
      current_altitude: input.reading.currentAltitude ?? null,
      average_speed: input.reading.averageSpeed ?? null,
      distance: input.reading.distance ?? null,
      ams_status: input.reading.amsStatus ?? null,
      fall_detected: input.reading.fallDetected ?? false,
      fall_type: input.reading.fallType ?? null,
      sos_countdown: input.reading.sosCountdown ?? false,
      sos_active: input.reading.sosActive ?? false,
      captured_at: input.reading.capturedAt,
      request_id: `${requestId.slice(0, 90)}:reading`,
    });
    if (error && error.code !== "23505" && !isHardwareMigrationError(error)) {
      throw error;
    }
  }

  if (input.location) {
    const { error } = await db.from("locations").insert({
      trekker_id: input.trekkerId,
      latitude: input.location.latitude,
      longitude: input.location.longitude,
      accuracy_meters: input.location.accuracyMeters ?? null,
      altitude: input.location.altitude ?? null,
      source:
        input.source === "physical_button"
          ? "device"
          : input.source === "manual"
            ? "manual"
            : "demo",
      captured_at: input.location.capturedAt,
      request_id: `${requestId.slice(0, 89)}:location`,
    });
    if (error && error.code !== "23505") throw error;
  }
}

function displayNumber(value: unknown, suffix = "") {
  return value == null || !Number.isFinite(Number(value))
    ? "unavailable"
    : `${Number(value)}${suffix}`;
}

function buildSosMapUrl(latitude: number | null | undefined, longitude: number | null | undefined) {
  if (
    latitude == null ||
    longitude == null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return "unavailable";
  }
  return `https://maps.google.com/?q=${latitude},${longitude}`;
}

async function createPendingNotificationAttempt(
  db: SupabaseClient,
  input: {
    phoneNumber: string;
    eventId: string;
    message: string;
    requestId: string;
  },
) {
  const { data, error } = await db
    .from("sms_attempts")
    .insert({
      sos_event_id: input.eventId,
      phone_number: input.phoneNumber,
      provider: "whatsapp",
      // `queued` is accepted by both the original and current schemas while
      // the parent SOS row carries the user-visible in-flight `pending` state.
      status: "queued",
      message: input.message,
      request_id: input.requestId,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) throw error;
  return data.id;
}

async function finalizeNotificationAttempt(
  db: SupabaseClient,
  attemptId: string,
  result: NotificationResult,
  context: RequestContext,
) {
  const occurredAt = new Date().toISOString();
  const lifecycleTimestamp =
    result.status === "sent"
      ? { sent_at: occurredAt }
      : result.status === "failed"
        ? { failed_at: occurredAt }
        : {};
  const storedResult = {
    provider: result.provider,
    status: result.status,
    provider_reference: result.providerMessageId ?? null,
    provider_response: result.providerSummary ?? null,
    error_message: result.error ?? null,
  };
  let { error } = await db
    .from("sms_attempts")
    .update({
      ...storedResult,
      ...lifecycleTimestamp,
    })
    .eq("id", attemptId);
  if (error?.code === "42703") {
    ({ error } = await db
      .from("sms_attempts")
      .update(storedResult)
      .eq("id", attemptId));
  }
  if (error) throw error;
  logInfo(context, "sos.notification_attempt_updated", {
    notificationAttemptId: attemptId,
    status: result.status,
    providerMessageIdStored: Boolean(result.providerMessageId),
    databaseUpdateSucceeded: true,
  });
}

export async function processSos(
  db: SupabaseClient,
  input: SosInput,
  requestId: string,
  context: RequestContext,
) {
  const { data: trekker, error: trekkerError } = await db
    .from("trekkers")
    .select(
      "id, name, route_name, is_active",
    )
    .eq("id", input.trekkerId)
    .eq("is_active", true)
    .maybeSingle<{
      id: string;
      name: string;
      route_name: string | null;
      is_active: boolean;
    }>();
  if (trekkerError) throw trekkerError;
  if (!trekker) {
    throw new SosWorkflowError(
      "UNKNOWN_TREKKER",
      "The user was not found.",
      404,
    );
  }

  await storeInlineTelemetry(db, input, requestId);

  let locationQuery = db
      .from("locations")
      .select("latitude, longitude, accuracy_meters, altitude, captured_at")
      .eq("trekker_id", trekker.id);
  if (input.source === "web_button") {
    locationQuery = locationQuery.eq("source", "browser");
  }

  const [locationResult, readingResult, sensorStateResult, symptomResult] = await Promise.all([
    locationQuery
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    withHardwareSchemaFallback<LatestValidReading, LegacyLatestValidReading>({
      enriched: () => db
        .from("sensor_readings")
        .select("heart_rate, spo2, altitude, temperature, sensor_state, captured_at")
        .eq("trekker_id", trekker.id)
        .eq("sensor_state", "valid")
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      legacy: () => db
        .from("sensor_readings")
        .select("heart_rate, spo2, altitude, temperature, captured_at")
        .eq("trekker_id", trekker.id)
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      adaptLegacy: (row) => row ? { ...row, sensor_state: null } : null,
      context,
      operation: "load latest valid SOS reading",
      table: "sensor_readings",
    }),
    withHardwareSchemaFallback<LatestSensorState, LegacyLatestSensorState>({
      enriched: () => db
        .from("sensor_readings")
        .select("sensor_state, captured_at")
        .eq("trekker_id", trekker.id)
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      legacy: () => db
        .from("sensor_readings")
        .select("captured_at")
        .eq("trekker_id", trekker.id)
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      adaptLegacy: (row) => row ? { ...row, sensor_state: null } : null,
      context,
      operation: "load latest SOS sensor state",
      table: "sensor_readings",
    }),
    db
      .from("symptom_reports")
      .select("symptom, severity, notes, created_at")
      .eq("trekker_id", trekker.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const latestError =
    locationResult.error ||
    symptomResult.error;
  if (latestError) throw latestError;

  const atomic = await createSosEventIfAllowed(
    db,
    {
      trekkerId: trekker.id,
      source: input.source,
      cooldownSeconds: env.sosCooldownSeconds,
      requestId,
    },
    context,
  );

  logInfo(context, "sos.idempotency_resolved", {
    sosEventId: atomic.eventId,
    existingActiveSosFound: atomic.duplicate,
    outcome: atomic.duplicate ? "reused" : "created",
    idempotencyKey: requestId,
  });

  if (atomic.duplicate) {
    const { data: existing, error } = await db
      .from("sos_events")
      .select(
        "id, status, sms_status, severity_score, severity_label, rescue_url, map_url, location_is_stale, reading_is_stale, created_at",
      )
      .eq("id", atomic.eventId)
      .single();
    if (error) throw error;
    logInfo(context, "sos.active_reused", {
      sosEventId: existing.id,
      notificationStatus: existing.sms_status,
    });
    return {
      event: {
        id: existing.id,
        status: visibleCaseStatus(existing.status),
        notificationStatus: existing.sms_status,
        severityScore: existing.severity_score,
        severityLabel: existing.severity_label,
        rescueUrl: existing.rescue_url || rescueUrl(existing.id, env.appUrl),
        mapUrl: existing.map_url,
        locationIsStale: existing.location_is_stale,
        readingIsStale: existing.reading_is_stale,
        createdAt: existing.created_at,
      },
      duplicate: true,
      notificationAttempts: [],
      message:
        "An open emergency case already exists; duplicate alerts were not sent.",
    };
  }

  const location = locationResult.data;
  const reading = readingResult.data;
  const latestSensorState = sensorStateResult.data?.sensor_state ?? null;
  const symptomReport = symptomResult.data;
  const locationIsStale = location
    ? ageSeconds(location.captured_at) > env.locationStaleSeconds
    : true;
  const readingIsStale = reading
    ? ageSeconds(reading.captured_at) > env.readingStaleSeconds
    : true;
  const severity = calculateSeverity({
    source: input.source,
    symptomSeverity: symptomReport?.severity ?? null,
    locationAvailable: Boolean(location),
    locationIsStale,
    readingAvailable: Boolean(reading),
    readingIsStale,
    heartRate: reading?.heart_rate == null ? null : Number(reading.heart_rate),
    spo2: reading?.spo2 == null ? null : Number(reading.spo2),
    temperature:
      reading?.temperature == null ? null : Number(reading.temperature),
  });
  const mapUrl = buildSosMapUrl(
    location?.latitude == null ? null : Number(location.latitude),
    location?.longitude == null ? null : Number(location.longitude),
  );
  const eventRescueUrl = rescueUrl(atomic.eventId, env.appUrl);
  const eventLocationStatus = locationStatus(
    Boolean(location),
    locationIsStale,
    location?.captured_at,
  );
  const locationAccuracy = location?.accuracy_meters == null
    ? ""
    : ` (accuracy ±${Math.round(Number(location.accuracy_meters))} m)`;
  const symptom = input.symptom ?? symptomReport?.symptom ?? "none reported";

  const { data: event, error: eventLookupError } = await db
    .from("sos_events")
    .select("created_at, status")
    .eq("id", atomic.eventId)
    .single<{ created_at: string; status: string }>();
  if (eventLookupError) throw eventLookupError;

  const templateValues: SosTemplateValues = {
    name: trekker.name,
    trekkerId: trekker.id,
    deviceId: input.deviceId || "unavailable",
    severityLabel: severity.severityLabel,
    severityScore: severity.severityScore,
    route: trekker.route_name || "unavailable",
    emergencyTime: event.created_at,
    heartRate: displayNumber(reading?.heart_rate, " bpm"),
    spo2: displayNumber(reading?.spo2, "%"),
    temperature: displayNumber(reading?.temperature, " C"),
    altitude: displayNumber(
      reading?.altitude ?? location?.altitude,
      " m",
    ),
    symptom,
    sensorState: latestSensorState || "unavailable",
    locationStatus: `${eventLocationStatus}${locationAccuracy}`,
    trackingId: atomic.eventId,
    mapUrl: mapUrl || "unavailable",
    rescueUrl: eventRescueUrl,
  };
  const message = buildSosMessage(templateValues);

  const configuredRecipient = configuredWhatsAppRecipient();
  const recipients = configuredRecipient ? [configuredRecipient] : [];

  const snapshot = {
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      location_accuracy: location?.accuracy_meters ?? null,
      location_captured_at: location?.captured_at ?? null,
      location_is_stale: locationIsStale,
      heart_rate: reading?.heart_rate ?? null,
      spo2: reading?.spo2 ?? null,
      altitude: reading?.altitude ?? location?.altitude ?? null,
      temperature: reading?.temperature ?? null,
      reading_captured_at: reading?.captured_at ?? null,
      reading_is_stale: readingIsStale,
      symptom,
      symptom_severity: symptomReport?.severity ?? null,
      symptom_notes: symptomReport?.notes ?? null,
      severity_score: severity.severityScore,
      severity_label: severity.severityLabel,
      severity_data_status: severity.dataStatus,
      rescue_url: eventRescueUrl,
      map_url: mapUrl,
      sms_message: message,
      sms_status: recipients.length ? "pending" : "not_configured",
  };
  await updateWithHardwareSchemaFallback({
    enriched: () => db
      .from("sos_events")
      .update({
        ...snapshot,
        sensor_state: latestSensorState,
        device_id: input.deviceId ?? null,
        hardware_event_id:
          input.source === "physical_button" ? requestId : null,
        fall_detected: input.reading?.fallDetected ?? null,
        fall_type: input.reading?.fallType ?? null,
        pressure: input.reading?.pressure ?? null,
        notification_started_at: recipients.length ? new Date().toISOString() : null,
      })
      .eq("id", atomic.eventId),
    legacy: () => db
      .from("sos_events")
      .update(snapshot)
      .eq("id", atomic.eventId),
    context,
    operation: "store SOS snapshot",
    table: "sos_events",
  });

  // Persist the audit row before contacting Meta. This prevents a successful
  // provider call from being invisible if the request is interrupted later.
  // It also makes the initial idempotency key the database duplicate guard.
  const preparedDeliveries = await Promise.all(
    recipients.map(async (phoneNumber) => {
      const attemptId = await createPendingNotificationAttempt(db, {
        phoneNumber,
        eventId: atomic.eventId,
        message,
        requestId,
      });
      logInfo(context, "sos.notification_attempt_created", {
        sosEventId: atomic.eventId,
        notificationAttemptId: attemptId,
      });
      return { phoneNumber, attemptId };
    }),
  );
  const deliveries = await Promise.all(
    preparedDeliveries.map(async ({ phoneNumber, attemptId }) => {
      let result: NotificationResult;
      try {
        result = await sendWhatsAppSosAlert(phoneNumber, templateValues, context);
      } catch {
        // The sender normally converts transport exceptions to `failed`; this
        // guard keeps the already-created audit row from remaining queued if a
        // future sender implementation unexpectedly throws.
        result = {
          success: false,
          status: "failed",
          provider: "whatsapp",
          error: "WhatsApp request failed.",
        };
      }
      try {
        await finalizeNotificationAttempt(db, attemptId, result, context);
      } catch (error) {
        logWarning(context, "sos.notification_attempt_finalize_failed", {
          sosEventId: atomic.eventId,
          notificationAttemptId: attemptId,
          databaseCode:
            error && typeof error === "object" && "code" in error
              ? String(error.code)
              : "unknown",
        });
        const failedResult: NotificationResult = {
          success: false,
          status: "failed",
          provider: "whatsapp",
          providerMessageId: result.providerMessageId,
          providerSummary: result.providerMessageId
            ? { metaAccepted: true, persistenceFailure: true }
            : { persistenceFailure: true },
          error: "The WhatsApp result could not be recorded safely.",
        };
        await finalizeNotificationAttempt(db, attemptId, failedResult, context);
        result = failedResult;
      }
      return { phoneNumber, result };
    }),
  );
  let notificationStatus = aggregateNotificationStatus(
    deliveries.map(({ result }) => result),
  );

  const firstAccepted = deliveries.find(({ result }) => result.success);
  let { error: statusError } = await db
    .from("sos_events")
    .update({
      sms_status: notificationStatus,
      provider_reference:
        firstAccepted?.result.providerMessageId ?? null,
      provider_response: deliveries.map(({ result }) => ({
        provider: result.provider,
        status: result.status,
        providerMessageId: result.providerMessageId ?? null,
        providerResponse: result.providerSummary ?? null,
        error: result.error ?? null,
      })),
    })
    .eq("id", atomic.eventId);
  if (statusError) {
    logWarning(context, "sos.notification_status_update_failed", {
      sosEventId: atomic.eventId,
      intendedStatus: notificationStatus,
      databaseCode: statusError.code,
    });
    ({ error: statusError } = await db
      .from("sos_events")
      .update({
        sms_status: "failed",
        provider_reference: null,
        provider_response: {
          error: "The WhatsApp result could not be recorded safely.",
        },
      })
      .eq("id", atomic.eventId));
    if (statusError) throw statusError;
    notificationStatus = "failed";
  }
  logInfo(context, "sos.notification_status_updated", {
    sosEventId: atomic.eventId,
    notificationStatus,
    databaseUpdateSucceeded: true,
  });

  logInfo(context, "sos.processed", {
    sosEventId: atomic.eventId,
    notificationStatus,
    recipientCount: recipients.length,
    locationIsStale,
    readingIsStale,
  });

  return {
    event: {
      id: atomic.eventId,
      status: visibleCaseStatus(event.status),
      notificationStatus,
      severityScore: severity.severityScore,
      severityLabel: severity.severityLabel,
      severityDataStatus: severity.dataStatus,
      rescueUrl: eventRescueUrl,
      mapUrl,
      locationIsStale,
      readingIsStale,
      createdAt: event.created_at,
    },
    duplicate: false,
    notificationAttempts: deliveries.map(({ result }) => ({
      provider: result.provider,
      status: result.status,
    })),
    notificationAuditRecorded: true,
  };
}
