import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { NotificationStatus, TrustedContacts } from "./notification";

const statusSchema = z.enum(["sent", "delivered", "read", "failed"]);

const webhookSchema = z
  .object({
    entry: z
      .array(
        z.object({
          changes: z
            .array(
              z.object({
                value: z.object({
                  statuses: z
                    .array(
                      z.object({
                        id: z.string().min(1),
                        status: statusSchema,
                        timestamp: z.string().regex(/^\d+$/).optional(),
                        errors: z
                          .array(
                            z.object({
                              title: z.string().optional(),
                              message: z.string().optional(),
                            }),
                          )
                          .optional(),
                      }),
                    )
                    .optional(),
                }),
              }),
            )
            .optional(),
        }),
      )
      .optional(),
  })
  .passthrough();

export type WhatsAppStatusEvent = {
  providerMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  occurredAt: string;
  error?: string;
};

export type SosTemplatePayloadValues = {
  name: string;
  trekkerId: string;
  mapUrl: string;
  rescueUrl: string;
  dashboardButtonParameter?: string;
};

export function buildSosTemplatePayload(
  recipient: string,
  values: SosTemplatePayloadValues,
  templateName = "argus_sos_alert",
  templateLanguage = "en_US",
) {
  const orderedValues = [
    values.name,
    values.trekkerId,
    "Critical SOS",
    values.mapUrl,
    values.rescueUrl,
  ];

  const components: Array<Record<string, unknown>> = [
    {
      type: "body",
      parameters: orderedValues.map((text) => ({ type: "text", text })),
    },
  ];
  if (values.dashboardButtonParameter) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: values.dashboardButtonParameter }],
    });
  }

  return {
    messaging_product: "whatsapp",
    to: recipient,
    type: "template",
    template: {
      name: templateName,
      language: { code: templateLanguage },
      components,
    },
  };
}

function statusTimestamp(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  const milliseconds = Number(value) * 1_000;
  if (!Number.isFinite(milliseconds)) return fallback;
  const timestamp = new Date(milliseconds);
  return Number.isNaN(timestamp.getTime()) ? fallback : timestamp.toISOString();
}

export function normalizeWhatsAppRecipient(value: string) {
  const digits = value.replace(/[+\s-]/g, "").replace(/\D/g, "");
  if (/^0?9[678]\d{8}$/.test(digits)) {
    return `977${digits.replace(/^0/, "")}`;
  }
  return /^9779[678]\d{8}$/.test(digits) ? digits : null;
}

export function trustedWhatsAppRecipients(contacts: TrustedContacts) {
  return [
    ...new Set(
      [contacts.emergency_contact, contacts.guide_mobile]
        .map((phone) => (phone ? normalizeWhatsAppRecipient(phone) : null))
        .filter((phone): phone is string => Boolean(phone)),
    ),
  ];
}

export function resolveWhatsAppRecipients(
  contacts: TrustedContacts,
  overrideRecipient?: string | null,
) {
  const normalizedOverride = overrideRecipient
    ? normalizeWhatsAppRecipient(overrideRecipient)
    : null;
  return normalizedOverride
    ? [normalizedOverride]
    : trustedWhatsAppRecipients(contacts);
}

export function whatsappConfigurationReady(input: {
  demoMode: boolean;
  enabled: boolean;
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  templateName: string;
}) {
  return (
    input.demoMode ||
    Boolean(
      input.enabled &&
        input.accessToken &&
        input.phoneNumberId &&
        input.businessAccountId &&
        input.templateName,
    )
  );
}

export function verifyWebhookSignature(
  rawBody: Uint8Array,
  signature: string | null,
  appSecret: string,
) {
  if (!signature?.startsWith("sha256=") || !appSecret) return false;
  const hex = signature.slice(7);
  if (!/^[a-f0-9]{64}$/i.test(hex)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const provided = Buffer.from(hex, "hex");
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

export function extractWhatsAppStatusEvents(payload: unknown) {
  const parsed = webhookSchema.safeParse(payload);
  if (!parsed.success) return null;
  const now = new Date().toISOString();
  const statuses =
    parsed.data.entry?.flatMap(
      (entry) =>
        entry.changes?.flatMap((change) => change.value.statuses ?? []) ?? [],
    ) ?? [];
  return statuses.map(
    (status): WhatsAppStatusEvent => ({
      providerMessageId: status.id,
      status: status.status,
      occurredAt: statusTimestamp(status.timestamp, now),
      error:
        status.status === "failed"
          ? status.errors?.[0]?.title ??
            status.errors?.[0]?.message ??
            "WhatsApp delivery failed."
          : undefined,
    }),
  );
}

const statusRank: Record<NotificationStatus, number> = {
  pending: 0,
  not_configured: 0,
  simulated: 1,
  accepted: 1,
  queued: 1,
  sent: 2,
  failed: 3,
  delivered: 4,
  read: 5,
};

export function shouldApplyWhatsAppStatus(
  current: NotificationStatus,
  next: WhatsAppStatusEvent["status"],
) {
  if (current === next || current === "read") return false;
  if (current === "delivered" && next === "failed") return false;
  return statusRank[next] >= statusRank[current];
}
