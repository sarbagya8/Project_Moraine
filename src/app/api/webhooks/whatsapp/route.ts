import { isSecretEqual } from "@/lib/api-auth";
import { failure, success } from "@/lib/api-response";
import { env } from "@/lib/env";
import {
  aggregateStoredNotificationStatus,
  type NotificationStatus,
} from "@/lib/notification";
import { databaseError } from "@/lib/api-route-support";
import { withRequestContext } from "@/lib/request-context";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  extractWhatsAppStatusEvents,
  shouldApplyWhatsAppStatus,
  verifyMetaSignature,
} from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRequestContext(
  "/api/webhooks/whatsapp",
  async (request) => {
    const url = new URL(request.url);
    const verified =
      url.searchParams.get("hub.mode") === "subscribe" &&
      isSecretEqual(
        url.searchParams.get("hub.verify_token"),
        env.whatsappWebhookVerifyToken,
      );
    const challenge = url.searchParams.get("hub.challenge");
    if (!verified || !challenge) {
      return failure(
        "WEBHOOK_VERIFICATION_FAILED",
        "Webhook verification failed.",
        403,
      );
    }
    return new Response(challenge, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  },
);

export const POST = withRequestContext(
  "/api/webhooks/whatsapp",
  async (request, _routeContext, context) => {
    const declaredLength = Number(request.headers.get("content-length"));
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > env.maxJsonBodyBytes
    ) {
      return failure("PAYLOAD_TOO_LARGE", "Webhook body is too large.", 413);
    }
    const rawBody = new Uint8Array(await request.arrayBuffer());
    if (rawBody.byteLength > env.maxJsonBodyBytes) {
      return failure("PAYLOAD_TOO_LARGE", "Webhook body is too large.", 413);
    }
    if (
      !verifyMetaSignature(
        rawBody,
        request.headers.get("x-hub-signature-256"),
      )
    ) {
      return failure(
        "INVALID_WEBHOOK_SIGNATURE",
        "Invalid webhook signature.",
        401,
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder().decode(rawBody)) as unknown;
    } catch {
      return failure("INVALID_WEBHOOK_BODY", "Invalid webhook body.", 400);
    }
    const events = extractWhatsAppStatusEvents(payload);
    if (!events) {
      return failure(
        "INVALID_WEBHOOK_PAYLOAD",
        "Invalid webhook payload.",
        400,
      );
    }

    try {
      const db = getSupabaseServer();
      let processed = 0;
      for (const event of events) {
        const { data: attempt, error: lookupError } = await db
          .from("sms_attempts")
          .select("id, sos_event_id, status")
          .eq("provider_reference", event.providerMessageId)
          .limit(1)
          .maybeSingle<{
            id: string;
            sos_event_id: string;
            status: NotificationStatus;
          }>();
        if (lookupError) throw lookupError;
        if (
          !attempt ||
          !shouldApplyWhatsAppStatus(attempt.status, event.status)
        ) {
          continue;
        }

        const timestamps =
          event.status === "sent"
            ? { sent_at: event.occurredAt }
            : event.status === "delivered"
              ? { delivered_at: event.occurredAt }
              : event.status === "read"
                ? { read_at: event.occurredAt }
                : { failed_at: event.occurredAt };
        const { error: attemptError } = await db
          .from("sms_attempts")
          .update({
            status: event.status,
            ...timestamps,
            ...(event.error ? { error_message: event.error } : {}),
          })
          .eq("id", attempt.id);
        if (attemptError) throw attemptError;

        const { data: attempts, error: aggregateError } = await db
          .from("sms_attempts")
          .select("status")
          .eq("sos_event_id", attempt.sos_event_id);
        if (aggregateError) throw aggregateError;
        const overallStatus = aggregateStoredNotificationStatus(
          (attempts ?? []).map(
            (stored) => stored.status as NotificationStatus,
          ),
        );
        const { error: eventError } = await db
          .from("sos_events")
          .update({ sms_status: overallStatus })
          .eq("id", attempt.sos_event_id);
        if (eventError) throw eventError;
        processed += 1;
      }

      return success({ received: true, processed });
    } catch (error) {
      return databaseError(error, context);
    }
  },
);
