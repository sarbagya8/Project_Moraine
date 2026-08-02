import { authorityAccessError } from "@/lib/api-auth";
import { failure, success } from "@/lib/api-response";
import { env } from "@/lib/env";
import { maskPhone } from "@/lib/phone";
import { checkRateLimit } from "@/lib/rate-limit";
import { withRequestContext } from "@/lib/request-context";
import {
  normalizeWhatsAppRecipient,
  sendWhatsAppSmokeTest,
} from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRequestContext(
  "/api/notifications/whatsapp/test",
  async (request) => {
    const rateLimit = checkRateLimit(request, "whatsapp-test", 2, 60_000);
    if (!rateLimit.allowed) {
      return failure(
        "RATE_LIMITED",
        `Wait ${rateLimit.retryAfter} seconds before another test.`,
        429,
      );
    }
    const authError = authorityAccessError(request);
    if (authError) return authError;

    const recipient = normalizeWhatsAppRecipient(env.whatsappRecipientNumber);
    if (!recipient) {
      return failure(
        "WHATSAPP_RECIPIENT_NUMBER_NOT_CONFIGURED",
        "WHATSAPP_RECIPIENT_NUMBER is missing or invalid.",
        503,
      );
    }

    const result = await sendWhatsAppSmokeTest(recipient);
    return success(
      {
        recipient: maskPhone(recipient),
        provider: result.provider,
        status: result.status,
        accepted: result.status === "accepted",
        providerMessageId: result.providerMessageId
          ? `...${result.providerMessageId.slice(-8)}`
          : null,
        error: result.error ?? null,
        note:
          result.status === "accepted"
            ? "Meta accepted the message; delivery is confirmed only by a verified webhook."
            : result.status === "simulated"
              ? "Demo mode is enabled; Meta was not contacted."
              : "Check the server-side Meta configuration and fixed test recipient.",
      },
      result.success
        ? 200
        : result.status === "not_configured"
          ? 503
          : 502,
    );
  },
);
