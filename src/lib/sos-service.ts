import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";
import type { NotificationResult } from "./notification";
import { aggregateNotificationStatus } from "./notification";
import { ageSeconds } from "./map-links";
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
  normalizeWhatsAppRecipient,
  sendWhatsAppSosAlert,
  type SosTemplateValues,
} from "./whatsapp";
import type { z } from "zod";

type SosInput = z.infer<typeof sosSchema>;

type RpcRow = {
  event_id: string;
  is_duplicate: boolean;
};

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
  const cutoff = new Date(
    Date.now() - input.cooldownSeconds * 1_000,
  ).toISOString();
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
    .in("status", ["active", "acknowledged"])
    .gte("created_at", cutoff)
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
    const { error } = await db.from("sensor_readings").insert({
      trekker_id: input.trekkerId,
      device_id: input.reading.deviceId,
      heart_rate: input.reading.heartRate,
      spo2: input.reading.spo2,
      altitude: input.reading.altitude ?? null,
      temperature: input.reading.temperature,
      captured_at: input.reading.capturedAt,
      request_id: `${requestId.slice(0, 90)}:reading`,
    });
    if (error && error.code !== "23505") throw error;
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

function notificationAttempt(
  phoneNumber: string,
  result: NotificationResult,
  eventId: string,
  message: string,
  requestId: string,
) {
  return {
    sos_event_id: eventId,
    phone_number: phoneNumber,
    provider: result.provider,
    status: result.status,
    message,
    provider_reference: result.providerMessageId ?? null,
    provider_response: result.providerSummary ?? null,
    error_message: result.error ?? null,
    request_id: requestId,
  };
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
      "id, name, emergency_contact, guide_mobile, route_name, is_active",
    )
    .eq("id", input.trekkerId)
    .eq("is_active", true)
    .maybeSingle<{
      id: string;
      name: string;
      emergency_contact: string | null;
      guide_mobile: string | null;
      route_name: string | null;
      is_active: boolean;
    }>();
  if (trekkerError) throw trekkerError;
  if (!trekker) {
    throw new SosWorkflowError(
      "UNKNOWN_TREKKER",
      "The trekker was not found.",
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

  const [locationResult, readingResult, symptomResult] = await Promise.all([
    locationQuery
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("sensor_readings")
      .select("heart_rate, spo2, altitude, temperature, captured_at")
      .eq("trekker_id", trekker.id)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("symptom_reports")
      .select("symptom, severity, notes, created_at")
      .eq("trekker_id", trekker.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const latestError =
    locationResult.error || readingResult.error || symptomResult.error;
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

  if (atomic.duplicate) {
    const { data: existing, error } = await db
      .from("sos_events")
      .select(
        "id, status, sms_status, severity_score, severity_label, rescue_url, map_url, location_is_stale, reading_is_stale, created_at",
      )
      .eq("id", atomic.eventId)
      .single();
    if (error) throw error;
    return {
      event: {
        id: existing.id,
        status: existing.status,
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
        "A recent SOS is already active; duplicate alerts were not sent.",
    };
  }

  const location = locationResult.data;
  const reading = readingResult.data;
  const symptomReport = symptomResult.data;
  const locationIsStale = location
    ? ageSeconds(location.captured_at) > env.locationStaleSeconds
    : false;
  const readingIsStale = reading
    ? ageSeconds(reading.captured_at) > env.readingStaleSeconds
    : false;
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
  const symptom = input.symptom ?? symptomReport?.symptom ?? "none reported";

  const { data: event, error: eventLookupError } = await db
    .from("sos_events")
    .select("created_at")
    .eq("id", atomic.eventId)
    .single<{ created_at: string }>();
  if (eventLookupError) throw eventLookupError;

  const templateValues: SosTemplateValues = {
    name: trekker.name,
    trekkerId: trekker.id,
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
    locationStatus: eventLocationStatus,
    trackingId: atomic.eventId,
    mapUrl: mapUrl || "unavailable",
    rescueUrl: eventRescueUrl,
  };
  const message = buildSosMessage(templateValues);

  const configuredRecipient = normalizeWhatsAppRecipient(
    env.whatsappTestRecipient,
  );
  const recipients = configuredRecipient ? [configuredRecipient] : [];

  const { error: snapshotError } = await db
    .from("sos_events")
    .update({
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
    })
    .eq("id", atomic.eventId);
  if (snapshotError) throw snapshotError;

  const deliveries = await Promise.all(
    recipients.map(async (phoneNumber) => ({
      phoneNumber,
      result: await sendWhatsAppSosAlert(phoneNumber, templateValues),
    })),
  );
  const notificationStatus = aggregateNotificationStatus(
    deliveries.map(({ result }) => result),
  );

  let attemptsRecorded = true;
  if (deliveries.length) {
    const { error } = await db.from("sms_attempts").insert(
      deliveries.map(({ phoneNumber, result }) =>
        notificationAttempt(
          phoneNumber,
          result,
          atomic.eventId,
          message,
          requestId,
        ),
      ),
    );
    if (error) {
      attemptsRecorded = false;
      logWarning(context, "sos.notification_audit_failed", {
        sosEventId: atomic.eventId,
        databaseCode: error.code,
      });
    }
  }

  const firstAccepted = deliveries.find(({ result }) => result.success);
  const { error: statusError } = await db
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
    logWarning(context, "sos.notification_status_audit_failed", {
      sosEventId: atomic.eventId,
      databaseCode: statusError.code,
    });
  }

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
      status: "active",
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
    notificationAuditRecorded: attemptsRecorded,
  };
}
