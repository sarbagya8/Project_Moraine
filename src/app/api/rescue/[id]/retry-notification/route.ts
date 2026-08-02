import { authorityAccessError } from "@/lib/api-auth";
import { failure, success, validationFailure } from "@/lib/api-response";
import { env } from "@/lib/env";
import { withHardwareSchemaFallback } from "@/lib/database-schema";
import {
  aggregateNotificationStatus,
  cooldownRemainingSeconds,
  type NotificationResult,
} from "@/lib/notification";
import { checkRateLimit } from "@/lib/rate-limit";
import { databaseError, zodDetails, zodMessage } from "@/lib/api-route-support";
import {
  logInfo,
  withRequestContext,
} from "@/lib/request-context";
import { getSupabaseServer } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/query-schema";
import type { SeverityLabel } from "@/lib/sos-rules";
import {
  configuredWhatsAppRecipient,
  sendWhatsAppSosAlert,
  type SosTemplateValues,
} from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

type RetryEvent = {
  id: string;
  trekker_id: string;
  device_id: string | null;
  severity_score: number | null;
  severity_label: string | null;
  heart_rate: number | null;
  spo2: number | null;
  temperature: number | null;
  altitude: number | null;
  sensor_state: string | null;
  symptom: string | null;
  location_is_stale: boolean;
  location_accuracy: number | null;
  location_captured_at: string | null;
  map_url: string | null;
  rescue_url: string | null;
  created_at: string;
  sms_message: string | null;
};

type LegacyRetryEvent = Omit<RetryEvent, "device_id" | "sensor_state">;

function value(number: unknown, suffix = "") {
  return number == null ? "unavailable" : `${Number(number)}${suffix}`;
}

export const POST = withRequestContext<RouteContext>(
  "/api/rescue/[id]/retry-notification",
  async (request, routeContext, context) => {
    const rateLimit = checkRateLimit(
      request,
      "retry-notification",
      5,
      60_000,
    );
    if (!rateLimit.allowed) {
      return failure(
        "RATE_LIMITED",
        `Too many notification retries. Retry in ${rateLimit.retryAfter} seconds.`,
        429,
      );
    }
    const authError = authorityAccessError(request);
    if (authError) return authError;

    const { id } = await routeContext.params;
    const parsedId = uuidSchema.safeParse(id);
    if (!parsedId.success) {
      return validationFailure(
        zodMessage(parsedId.error),
        zodDetails(parsedId.error),
      );
    }

    try {
      const db = getSupabaseServer();
      const eventResult = await withHardwareSchemaFallback<RetryEvent, LegacyRetryEvent>({
        enriched: () => db
          .from("sos_events")
          .select(
            "id, trekker_id, device_id, severity_score, severity_label, heart_rate, spo2, temperature, altitude, sensor_state, symptom, location_is_stale, location_accuracy, location_captured_at, map_url, rescue_url, created_at, sms_message",
          )
          .eq("id", parsedId.data)
          .maybeSingle()
          .returns<RetryEvent>(),
        legacy: () => db
          .from("sos_events")
          .select(
            "id, trekker_id, severity_score, severity_label, heart_rate, spo2, temperature, altitude, symptom, location_is_stale, location_accuracy, location_captured_at, map_url, rescue_url, created_at, sms_message",
          )
          .eq("id", parsedId.data)
          .maybeSingle()
          .returns<LegacyRetryEvent>(),
        adaptLegacy: (event) => event ? {
          ...event,
          device_id: null,
          sensor_state: null,
        } : null,
        context,
        operation: "load SOS notification retry",
        table: "sos_events",
      });
      const event = eventResult.data;
      if (!event) {
        return failure("SOS_NOT_FOUND", "The SOS event was not found.", 404);
      }

      const { data: latestAttempt, error: attemptError } = await db
        .from("sms_attempts")
        .select("created_at")
        .eq("sos_event_id", event.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ created_at: string }>();
      if (attemptError) throw attemptError;
      if (latestAttempt) {
        const remaining = cooldownRemainingSeconds(
          latestAttempt.created_at,
          env.notificationRetryCooldownSeconds,
        );
        if (remaining > 0) {
          return failure(
            "NOTIFICATION_RETRY_COOLDOWN",
            `Wait ${remaining} seconds before retrying.`,
            409,
          );
        }
      }

      const { data: latestStatusAttempt, error: latestStatusError } = await db
        .from("sms_attempts")
        .select("status, provider_reference")
        .eq("sos_event_id", event.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ status: string; provider_reference: string | null }>();
      if (latestStatusError) throw latestStatusError;
      if (
        !latestStatusAttempt ||
        latestStatusAttempt.provider_reference ||
        !["failed", "not_configured"].includes(latestStatusAttempt.status)
      ) {
        return failure(
          "NOTIFICATION_RETRY_NOT_AVAILABLE",
          "Only failed or unconfigured notification attempts can be retried.",
          409,
        );
      }

      const { data: trekker, error: trekkerError } = await db
        .from("trekkers")
        .select(
          "id, name, route_name",
        )
        .eq("id", event.trekker_id)
        .maybeSingle<{
          id: string;
          name: string;
          route_name: string | null;
        }>();
      if (trekkerError) throw trekkerError;
      if (!trekker) {
        return failure("TREKKER_NOT_FOUND", "The trekker was not found.", 404);
      }
      const configuredRecipient = configuredWhatsAppRecipient();
      const recipients = configuredRecipient ? [configuredRecipient] : [];
      if (!recipients.length) {
        return failure(
          "NO_VALID_RECIPIENTS",
          "WHATSAPP_RECIPIENT_NUMBER is missing or invalid.",
          409,
        );
      }

      const { data: claimedEvent, error: claimError } = await db
        .from("sos_events")
        .update({ sms_status: "queued" })
        .eq("id", event.id)
        .eq("sms_status", latestStatusAttempt.status)
        .select("id")
        .maybeSingle<{ id: string }>();
      if (claimError) throw claimError;
      if (!claimedEvent) {
        return failure(
          "NOTIFICATION_RETRY_IN_PROGRESS",
          "A notification retry is already in progress.",
          409,
        );
      }

      const template: SosTemplateValues = {
        name: trekker.name,
        trekkerId: trekker.id,
        deviceId: event.device_id || "unavailable",
        severityLabel: (event.severity_label || "moderate") as SeverityLabel,
        severityScore: Number(event.severity_score ?? 0),
        route: trekker.route_name || "unavailable",
        emergencyTime: event.created_at,
        heartRate: value(event.heart_rate, " bpm"),
        spo2: value(event.spo2, "%"),
        temperature: value(event.temperature, " C"),
        altitude: value(event.altitude, " m"),
        symptom: event.symptom || "none reported",
        sensorState: event.sensor_state || "unavailable",
        locationStatus: event.location_captured_at
          ? event.location_is_stale
            ? `stale${event.location_accuracy == null ? "" : ` (accuracy ±${Math.round(Number(event.location_accuracy))} m)`}`
            : `fresh${event.location_accuracy == null ? "" : ` (accuracy ±${Math.round(Number(event.location_accuracy))} m)`}`
          : "unavailable",
        trackingId: event.id,
        mapUrl: event.map_url || "unavailable",
        rescueUrl: event.rescue_url || "unavailable",
      };
      // Create the retry audit row before calling Meta. A response is written
      // back to this exact row, preserving an unbroken provider audit trail.
      const preparedDeliveries = await Promise.all(recipients.map(async (phoneNumber) => {
        const { data, error } = await db.from("sms_attempts").insert({
          sos_event_id: event.id,
          phone_number: phoneNumber,
          provider: "whatsapp",
          status: "queued",
          message: event.sms_message || "ARGUS SOS alert",
          request_id: context.requestId,
        }).select("id").single<{ id: string }>();
        if (error) throw error;
        logInfo(context, "sos.notification_attempt_created", {
          sosEventId: event.id,
          notificationAttemptId: data.id,
          retry: true,
        });
        return { phoneNumber, attemptId: data.id };
      }));
      const deliveries = await Promise.all(preparedDeliveries.map(async ({ phoneNumber, attemptId }) => {
        let result: NotificationResult;
        try {
          result = await sendWhatsAppSosAlert(phoneNumber, template, context);
        } catch {
          result = { success: false, status: "failed" as const, provider: "whatsapp" as const, error: "WhatsApp request failed." };
        }
        const occurredAt = new Date().toISOString();
        const storedResult = {
          provider: result.provider,
          status: result.status,
          provider_reference: result.providerMessageId ?? null,
          provider_response: result.providerSummary ?? null,
          error_message: result.error ?? null,
        };
        const lifecycleTimestamp = result.status === "sent"
          ? { sent_at: occurredAt }
          : result.status === "failed"
            ? { failed_at: occurredAt }
            : {};
        let { error } = await db.from("sms_attempts").update({
          ...storedResult,
          ...lifecycleTimestamp,
        }).eq("id", attemptId);
        if (error?.code === "42703") {
          ({ error } = await db.from("sms_attempts").update(storedResult).eq("id", attemptId));
        }
        if (error) throw error;
        logInfo(context, "sos.notification_attempt_updated", {
          sosEventId: event.id,
          notificationAttemptId: attemptId,
          status: result.status,
          providerMessageIdStored: Boolean(result.providerMessageId),
          retry: true,
        });
        return { phoneNumber, result };
      }));
      const notificationStatus = aggregateNotificationStatus(deliveries.map(({ result }) => result));

      const firstAccepted = deliveries.find(({ result }) => result.success);
      const { error: statusError } = await db
        .from("sos_events")
        .update({
          sms_status: notificationStatus,
          provider_reference:
            firstAccepted?.result.providerMessageId ?? null,
        })
        .eq("id", event.id);
      if (statusError) throw statusError;
      logInfo(context, "sos.notification_status_updated", {
        sosEventId: event.id,
        notificationStatus,
        databaseUpdateSucceeded: true,
        retry: true,
      });

      logInfo(context, "sos.notification_retry_processed", {
        sosEventId: event.id,
        notificationStatus,
        recipientCount: recipients.length,
      });
      return success({
        eventId: event.id,
        notificationStatus,
        demoMode: env.demoMode,
        attempts: deliveries.map(({ result }) => ({
          provider: result.provider,
          status: result.status,
          error: result.error ?? null,
        })),
      });
    } catch (error) {
      return databaseError(error, context, { name: "retry SOS notification", table: "sos_events" });
    }
  },
);
