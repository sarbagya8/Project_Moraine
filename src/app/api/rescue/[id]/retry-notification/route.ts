import { isAdminAuthorized } from "@/lib/api-auth";
import { failure, success, validationFailure } from "@/lib/api-response";
import { env } from "@/lib/env";
import {
  aggregateNotificationStatus,
  cooldownRemainingSeconds,
} from "@/lib/notification";
import { checkRateLimit } from "@/lib/rate-limit";
import { databaseError, zodDetails, zodMessage } from "@/lib/api-route-support";
import {
  logInfo,
  logWarning,
  withRequestContext,
} from "@/lib/request-context";
import { getSupabaseServer } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/query-schema";
import type { SeverityLabel } from "@/lib/sos-rules";
import {
  resolveWhatsAppRecipients,
  sendWhatsAppSosAlert,
  type SosTemplateValues,
} from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

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
    if (!env.administrativeAuthConfigured) {
      return failure(
        "ADMIN_AUTH_NOT_CONFIGURED",
        "Administrative authentication is not configured.",
        503,
      );
    }
    if (!isAdminAuthorized(request)) {
      return failure(
        "UNAUTHORIZED_ADMIN",
        "A valid administrative API key is required.",
        401,
      );
    }

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
      const { data: event, error: eventError } = await db
        .from("sos_events")
        .select(
          "id, trekker_id, severity_score, severity_label, heart_rate, spo2, temperature, altitude, symptom, location_is_stale, location_captured_at, map_url, rescue_url, created_at, sms_message",
        )
        .eq("id", parsedId.data)
        .maybeSingle();
      if (eventError) throw eventError;
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

      const { data: trekker, error: trekkerError } = await db
        .from("trekkers")
        .select(
          "id, name, emergency_contact, guide_mobile, route_name",
        )
        .eq("id", event.trekker_id)
        .maybeSingle<{
          id: string;
          name: string;
          emergency_contact: string | null;
          guide_mobile: string | null;
          route_name: string | null;
        }>();
      if (trekkerError) throw trekkerError;
      if (!trekker) {
        return failure("TREKKER_NOT_FOUND", "The trekker was not found.", 404);
      }
      const recipients = resolveWhatsAppRecipients(
        trekker,
        trekker.id === "TRK-DEMO-001" ? env.whatsappTestRecipient : null,
      );
      if (!recipients.length) {
        return failure(
          "NO_VALID_RECIPIENTS",
          "No valid trusted-contact WhatsApp recipients are available.",
          409,
        );
      }

      const template: SosTemplateValues = {
        name: trekker.name,
        trekkerId: trekker.id,
        severityLabel: (event.severity_label || "moderate") as SeverityLabel,
        severityScore: Number(event.severity_score ?? 0),
        route: trekker.route_name || "unavailable",
        emergencyTime: event.created_at,
        heartRate: value(event.heart_rate, " bpm"),
        spo2: value(event.spo2, "%"),
        temperature: value(event.temperature, " C"),
        altitude: value(event.altitude, " m"),
        symptom: event.symptom || "none reported",
        locationStatus: event.location_captured_at
          ? event.location_is_stale
            ? "stale"
            : "fresh"
          : "unavailable",
        trackingId: event.id,
        mapUrl: event.map_url || "unavailable",
        rescueUrl: event.rescue_url || "unavailable",
      };
      const deliveries = await Promise.all(
        recipients.map(async (phoneNumber) => ({
          phoneNumber,
          result: await sendWhatsAppSosAlert(phoneNumber, template),
        })),
      );
      const notificationStatus = aggregateNotificationStatus(
        deliveries.map(({ result }) => result),
      );
      const { error: auditError } = await db.from("sms_attempts").insert(
        deliveries.map(({ phoneNumber, result }) => ({
          sos_event_id: event.id,
          phone_number: phoneNumber,
          provider: result.provider,
          status: result.status,
          message: event.sms_message || "ARGUS SOS alert",
          provider_reference: result.providerMessageId ?? null,
          provider_response: result.providerSummary ?? null,
          error_message: result.error ?? null,
          request_id: context.requestId,
        })),
      );
      if (auditError) {
        logWarning(context, "sos.notification_retry_audit_failed", {
          sosEventId: event.id,
          databaseCode: auditError.code,
        });
      }

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
      return databaseError(error, context);
    }
  },
);
