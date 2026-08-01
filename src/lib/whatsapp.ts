import "server-only";
import { env } from "./env";
import type { NotificationResult } from "./notification";
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
  severityLabel: SeverityLabel;
  severityScore: number;
  route: string;
  emergencyTime: string;
  heartRate: string;
  spo2: string;
  temperature: string;
  altitude: string;
  symptom: string;
  locationStatus: string;
  trackingId: string;
  mapUrl: string;
  rescueUrl: string;
};

function graphEndpoint() {
  return `${META_GRAPH_URL}/${env.whatsappApiVersion}/${env.whatsappPhoneNumberId}/messages`;
}

function smokeTestPayload(recipient: string, templateName = env.whatsappTemplateName || "hello_world") {
  const values: SosTemplateValues = {
    name: "Smoke Test",
    trekkerId: "test-id",
    severityLabel: "low",
    severityScore: 0,
    route: "Test Route",
    emergencyTime: new Date().toISOString(),
    heartRate: "---",
    spo2: "---",
    temperature: "---",
    altitude: "---",
    symptom: "Smoke test",
    locationStatus: "Test",
    trackingId: "smoke-test",
    mapUrl: "https://maps.google.com/?q=0,0",
    rescueUrl: "https://example.com/rescue/test",
  };
  return buildSosTemplatePayload(
    recipient,
    {
      name: values.name,
      trekkerId: values.trekkerId,
      mapUrl: values.mapUrl,
      rescueUrl: values.rescueUrl,
    },
    templateName,
    env.whatsappTemplateLanguage,
  );
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
    error_data?: unknown;
  };
  return {
    message:
      typeof details.message === "string"
        ? details.message.slice(0, 300)
        : `Meta returned HTTP ${status}.`,
    summary: {
      httpStatus: status,
      code: typeof details.code === "number" ? details.code : undefined,
      subcode:
        typeof details.error_subcode === "number"
          ? details.error_subcode
          : undefined,
      type: typeof details.type === "string" ? details.type : undefined,
      errorData:
        details.error_data && typeof details.error_data === "object"
          ? details.error_data
          : undefined,
    },
  };
}

async function sendTemplate(
  payload: object,
  configured = env.whatsappConfigured,
): Promise<NotificationResult> {
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
      status: "not_configured",
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
    if (!response.ok || !providerMessageId) {
      const parsed = metaError(body, response.status);
      console.warn("WhatsApp template request failed", {
        status: response.status,
        code: parsed.summary.code,
        subcode: parsed.summary.subcode,
        type: parsed.summary.type,
        message: parsed.message,
        errorData: parsed.summary.errorData,
      });
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
      status: "sent",
      provider: "whatsapp",
      providerMessageId,
      providerSummary: {
        httpStatus: response.status,
        accepted: true,
        response: body,
      },
    };
  } catch (error) {
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
        mapUrl: values.mapUrl,
        rescueUrl: values.rescueUrl,
      },
      env.whatsappTemplateName,
      env.whatsappTemplateLanguage,
    ),
  );
}

export async function sendWhatsAppSmokeTest(recipient: string) {
  const normalized = normalizeWhatsAppRecipient(recipient);
  if (!normalized) {
    return {
      success: false,
      status: "failed",
      provider: "whatsapp",
      error: "WHATSAPP_TEST_RECIPIENT is invalid.",
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
