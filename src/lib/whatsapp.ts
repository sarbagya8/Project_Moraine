import "server-only";
import { env } from "./env";
import type { NotificationResult } from "./notification";
import type { RequestContext } from "./request-context";
import { logInfo, logWarning } from "./request-context";
import type { SeverityLabel } from "./sos-rules";
import {
  buildSosTemplatePayload,
  extractWhatsAppStatusEvents,
  normalizeWhatsAppRecipient,
  resolveWhatsAppRecipients,
  shouldApplyWhatsAppStatus,
  trustedWhatsAppRecipients,
  verifyWebhookSignature,
} from "./whatsapp-protocol";

export {
  buildSosTemplatePayload,
  extractWhatsAppStatusEvents,
  normalizeWhatsAppRecipient,
  resolveWhatsAppRecipients,
  shouldApplyWhatsAppStatus,
  trustedWhatsAppRecipients,
};

const META_GRAPH_URL = "https://graph.facebook.com";
export type SosTemplateValues = {
  name: string;
  trekkerId: string;
  deviceId?: string;
  severityLabel: SeverityLabel;
  severityScore: number;
  route: string;
  emergencyTime: string;
  heartRate: string;
  spo2: string;
  temperature: string;
  altitude: string;
  symptom: string;
  sensorState?: string;
  locationStatus: string;
  trackingId: string;
  mapUrl: string;
  rescueUrl: string;
};

function graphEndpoint() {
  return `${META_GRAPH_URL}/${env.whatsappApiVersion}/${env.whatsappPhoneNumberId}/messages`;
}

function safeProviderMessage(message: string) {
  return message
    .slice(0, 300)
    .replace(/\+?\d[\d\s()-]{8,}\d/g, (value) => {
      const digits = value.replace(/\D/g, "");
      return digits.length > 4 ? `***${digits.slice(-4)}` : "****";
    });
}

function stringifyLog(details: Record<string, unknown>) {
  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return {
    name: "UnknownError",
    message: String(error),
  };
}

function logSendConfiguration(recipient: string, context?: RequestContext) {
  // Keep enough operational context to diagnose a server-side send without
  // ever writing an access token or a full recipient number to logs.
  const details = {
    event: "whatsapp.send_entered",
    notificationsEnabled: env.whatsappNotificationsEnabled,
    demoMode: env.demoMode,
    accessTokenPresent: Boolean(env.whatsappAccessToken),
    accessTokenLength: env.whatsappAccessToken.length,
    phoneNumberIdPresent: Boolean(env.whatsappPhoneNumberId),
    phoneNumberIdLastFour: env.whatsappPhoneNumberId.slice(-4) || null,
    businessAccountIdPresent: Boolean(env.whatsappBusinessAccountId),
    templateNamePresent: Boolean(env.whatsappTemplateName),
    recipientSource: "WHATSAPP_RECIPIENT_NUMBER",
    recipientLength: recipient.length,
    recipientLastFour: recipient.slice(-4) || null,
    templateName: env.whatsappTemplateName,
    templateLanguage: env.whatsappTemplateLanguage,
    graphApiUrl: graphEndpoint(),
  };
  if (context) logInfo(context, "whatsapp.send_entered", details);
  else console.info("[WhatsApp] send_entered", stringifyLog(details));
}

export function configuredWhatsAppRecipient() {
  return normalizeWhatsAppRecipient(env.whatsappRecipientNumber);
}

function smokeTestPayload(recipient: string) {
  return {
    messaging_product: "whatsapp",
    to: recipient,
    type: "template",
    template: {
      name: "hello_world",
      language: { code: "en_US" },
    },
  };
}

function metaError(body: unknown, status: number) {
  if (!body || typeof body !== "object" || !("error" in body)) {
    return {
      message: `Meta returned HTTP ${status}.`,
      summary: { httpStatus: status },
    };
  }
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== "object") {
    return {
      message: `Meta returned HTTP ${status}.`,
      summary: { httpStatus: status },
    };
  }
  const details = error as {
    message?: unknown;
    code?: unknown;
    error_subcode?: unknown;
    type?: unknown;
    fbtrace_id?: unknown;
    error_data?: unknown;
  };
  const errorData = details.error_data;
  const metaDetails =
    errorData && typeof errorData === "object" &&
    typeof (errorData as Record<string, unknown>).details === "string"
      ? safeProviderMessage(
          (errorData as Record<string, unknown>).details as string,
        )
      : undefined;
  return {
    message:
      typeof details.message === "string"
        ? safeProviderMessage(details.message)
        : `Meta returned HTTP ${status}.`,
    summary: {
      httpStatus: status,
      code: typeof details.code === "number" ? details.code : undefined,
      subcode:
        typeof details.error_subcode === "number"
          ? details.error_subcode
          : undefined,
      type: typeof details.type === "string" ? details.type : undefined,
      details: metaDetails,
      traceId:
        typeof details.fbtrace_id === "string"
          ? details.fbtrace_id
          : undefined,
    },
  };
}

async function sendTemplate(
  payload: object,
  configured = env.whatsappConfigured,
  context?: RequestContext,
): Promise<NotificationResult> {
  const recipient =
    payload && typeof payload === "object" && "to" in payload &&
    typeof payload.to === "string"
      ? payload.to
      : "";
  logSendConfiguration(recipient, context);

  if (env.demoMode) {
    return {
      success: true,
      status: "simulated",
      provider: "demo",
      providerSummary: { simulated: true },
    };
  }
  if (!configured) {
    return {
      success: false,
      status: "failed",
      provider: "whatsapp",
      error: "WhatsApp Cloud API is not fully configured.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.notificationTimeoutMs);
  try {
    const response = await fetch(graphEndpoint(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.whatsappAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as
      | (Record<string, unknown> & { messages?: Array<{ id?: string }> })
      | null;
    const providerMessageId = body?.messages?.[0]?.id;
    const responseDetails = {
      httpStatus: response.status,
      providerMessageIdReceived: Boolean(providerMessageId),
      ...(providerMessageId ? { providerMessageId } : {}),
    };
    if (context) logInfo(context, "whatsapp.meta_response", responseDetails);
    else console.info("[WhatsApp] meta_response", stringifyLog(responseDetails));
    if (!response.ok || !providerMessageId) {
      const parsed = metaError(body, response.status);
      const failureDetails = {
        event: "whatsapp.meta_rejected",
        status: response.status,
        metaCode: parsed.summary.code,
        metaSubcode: parsed.summary.subcode,
        type: parsed.summary.type,
        details: parsed.summary.details,
        traceId: parsed.summary.traceId,
        message: parsed.message,
      };
      if (context) logWarning(context, "whatsapp.meta_rejected", failureDetails);
      else console.warn("[WhatsApp] meta_rejected", stringifyLog(failureDetails));
      return {
        success: false,
        status: "failed",
        provider: "whatsapp",
        error: parsed.message,
        providerSummary: parsed.summary,
      };
    }
    return {
      success: true,
      // Meta returns a message id only after accepting the request.  In this
      // pipeline that is the durable `sent` transition; later webhook events
      // advance it to delivered, read, or failed.
      status: "sent",
      provider: "whatsapp",
      providerMessageId,
      providerSummary: {
        httpStatus: response.status,
        accepted: true,
      },
    };
  } catch (error) {
    const failureDetails = {
      timedOut: error instanceof Error && error.name === "AbortError",
      errorName: error instanceof Error ? error.name : "UnknownError",
      ...serializeError(error),
    };
    if (context) logWarning(context, "whatsapp.request_failed", failureDetails);
    else console.warn("[WhatsApp] request_failed", stringifyLog(failureDetails));
    return {
      success: false,
      status: "failed",
      provider: "whatsapp",
      error:
        error instanceof Error && error.name === "AbortError"
          ? "WhatsApp request timed out."
          : "WhatsApp request failed.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendWhatsAppSosAlert(
  recipient: string,
  values: SosTemplateValues,
  context?: RequestContext,
) {
  const normalized = normalizeWhatsAppRecipient(recipient);
  if (!normalized) {
    return {
      success: false,
      status: "failed",
      provider: "whatsapp",
      error: "Recipient number is invalid.",
    } satisfies NotificationResult;
  }
  return sendTemplate(
    buildSosTemplatePayload(
      normalized,
      {
        name: values.name,
        trekkerId: values.trekkerId,
        deviceId: values.deviceId || "unavailable",
        severity: `${values.severityLabel} (${values.severityScore}/100)`,
        route: values.route,
        emergencyTime: values.emergencyTime,
        heartRate: values.heartRate,
        spo2: values.spo2,
        temperature: values.temperature,
        altitude: values.altitude,
        symptom: values.symptom,
        sensorState: values.sensorState || "unavailable",
        locationStatus: values.locationStatus,
        trackingId: values.trackingId,
        mapUrl: values.mapUrl,
        rescueUrl: values.rescueUrl,
      },
      env.whatsappTemplateName,
      env.whatsappTemplateLanguage,
    ),
    env.whatsappConfigured,
    context,
  );
}

export async function sendWhatsAppSmokeTest(recipient: string) {
  const normalized = normalizeWhatsAppRecipient(recipient);
  if (!normalized) {
    return {
      success: false,
      status: "failed",
      provider: "whatsapp",
      error: "WHATSAPP_RECIPIENT_NUMBER is invalid.",
    } satisfies NotificationResult;
  }
  return sendTemplate(
    smokeTestPayload(normalized),
    env.whatsappSmokeTestConfigured,
  );
}

export function verifyMetaSignature(
  rawBody: Uint8Array,
  signature: string | null,
) {
  return verifyWebhookSignature(
    rawBody,
    signature,
    env.metaAppSecret,
  );
}
