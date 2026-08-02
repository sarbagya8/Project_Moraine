import "server-only";
import { isValidScryptPasswordHash } from "./auth-protocol";
import { whatsappConfigurationReady } from "./whatsapp-protocol";

const isTrue = (value: string | undefined) =>
  value?.trim().toLowerCase() === "true";

function boundedNumber(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}

function publicAppUrl() {
  const candidate = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!candidate) return "http://localhost:3000";

  try {
    const url = new URL(candidate);
    return ["http:", "https:"].includes(url.protocol)
      ? url.toString().replace(/\/$/, "")
      : "http://localhost:3000";
  } catch {
    return "http://localhost:3000";
  }
}

function value(name: string) {
  return process.env[name]?.trim() || "";
}

export const env = {
  get appUrl() {
    return publicAppUrl();
  },
  get demoMode() {
    return isTrue(process.env.DEMO_MODE);
  },
  get locationStaleSeconds() {
    return boundedNumber(process.env.LOCATION_STALE_SECONDS, 120, 15, 86_400);
  },
  get readingStaleSeconds() {
    return boundedNumber(process.env.READING_STALE_SECONDS, 300, 15, 86_400);
  },
  get sosCooldownSeconds() {
    return boundedNumber(process.env.SOS_COOLDOWN_SECONDS, 30, 10, 3_600);
  },
  get notificationRetryCooldownSeconds() {
    return boundedNumber(
      process.env.NOTIFICATION_RETRY_COOLDOWN_SECONDS,
      60,
      30,
      3_600,
    );
  },
  get maxJsonBodyBytes() {
    return boundedNumber(
      process.env.MAX_JSON_BODY_BYTES,
      32_768,
      1_024,
      262_144,
    );
  },
  get notificationTimeoutMs() {
    return boundedNumber(
      process.env.WHATSAPP_TIMEOUT_MS,
      10_000,
      1_000,
      30_000,
    );
  },
  get databaseConfigured() {
    return Boolean(
      value("NEXT_PUBLIC_SUPABASE_URL") && value("SUPABASE_SERVICE_ROLE_KEY"),
    );
  },
  get deviceApiKeyConfigured() {
    return Boolean(value("DEVICE_API_KEY"));
  },
  get adminApiKeyConfigured() {
    return Boolean(value("ADMIN_API_KEY"));
  },
  get authorityUsername() {
    return value("AUTHORITY_USERNAME");
  },
  get authorityPasswordHash() {
    return value("AUTHORITY_PASSWORD_HASH");
  },
  get sessionSecret() {
    return value("SESSION_SECRET");
  },
  get sessionMaxAgeSeconds() {
    return boundedNumber(
      process.env.SESSION_MAX_AGE_SECONDS,
      28_800,
      900,
      604_800,
    );
  },
  get authorityPasswordHashValid() {
    return isValidScryptPasswordHash(this.authorityPasswordHash);
  },
  get portalAuthConfigured() {
    return Boolean(
      this.authorityUsername &&
        this.authorityPasswordHashValid &&
        this.sessionSecret.length >= 32,
    );
  },
  get administrativeAuthConfigured() {
    return this.adminApiKeyConfigured || this.portalAuthConfigured;
  },
  get whatsappNotificationsEnabled() {
    return isTrue(process.env.WHATSAPP_NOTIFICATIONS_ENABLED);
  },
  get whatsappAccessToken() {
    return value("WHATSAPP_ACCESS_TOKEN");
  },
  get whatsappPhoneNumberId() {
    return value("WHATSAPP_PHONE_NUMBER_ID");
  },
  get whatsappBusinessAccountId() {
    return value("WHATSAPP_BUSINESS_ACCOUNT_ID");
  },
  get whatsappApiVersion() {
    return value("WHATSAPP_API_VERSION") || "v23.0";
  },
  get whatsappRecipientNumber() {
    return value("WHATSAPP_RECIPIENT_NUMBER");
  },
  get whatsappTemplateName() {
    return value("WHATSAPP_TEMPLATE_NAME");
  },
  get whatsappTemplateLanguage() {
    return value("WHATSAPP_TEMPLATE_LANGUAGE") || "en_US";
  },
  get whatsappWebhookVerifyToken() {
    return value("WHATSAPP_WEBHOOK_VERIFY_TOKEN");
  },
  get metaAppSecret() {
    return value("META_APP_SECRET");
  },
  get whatsappConfigured() {
    return whatsappConfigurationReady({
      demoMode: this.demoMode,
      enabled: this.whatsappNotificationsEnabled,
      accessToken: this.whatsappAccessToken,
      phoneNumberId: this.whatsappPhoneNumberId,
      businessAccountId: this.whatsappBusinessAccountId,
      templateName: this.whatsappTemplateName,
      recipientNumber: this.whatsappRecipientNumber,
    });
  },
  get whatsappSmokeTestConfigured() {
    if (this.demoMode) return true;
    return Boolean(
      this.whatsappNotificationsEnabled &&
        this.whatsappAccessToken &&
        this.whatsappPhoneNumberId &&
        this.whatsappBusinessAccountId &&
        this.whatsappRecipientNumber,
    );
  },
  get whatsappWebhookConfigured() {
    return Boolean(this.whatsappWebhookVerifyToken && this.metaAppSecret);
  },
};
