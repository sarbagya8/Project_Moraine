import { success } from "@/lib/api-response";
import { SAFETY_DISCLAIMER } from "@/lib/disclaimer";
import { env } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { withRequestContext } from "@/lib/request-context";
import { getSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function databaseProbe() {
  if (!env.databaseConfigured) return "not_configured" as const;

  try {
    const result = await Promise.race([
      getSupabaseServer().from("trekkers").select("id", { head: true, count: "exact" }).limit(1),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("DATABASE_PROBE_TIMEOUT")), 3_000),
      ),
    ]);
    return result.error ? ("unavailable" as const) : ("reachable" as const);
  } catch {
    return "unavailable" as const;
  }
}

export const GET = withRequestContext("/api/health", async (request) => {
  const rateLimit = checkRateLimit(request, "health", 60, 60_000);
  const deep = new URL(request.url).searchParams.get("deep") === "true";

  return success({
    service: "ARGUS API",
    status: "ok",
    databaseConfigured: env.databaseConfigured,
    databaseStatus: deep ? await databaseProbe() : "not_checked",
    deviceAuthConfigured: env.deviceApiKeyConfigured,
    adminAuthConfigured: env.administrativeAuthConfigured,
    notificationConfigured: env.whatsappConfigured,
    providerStatus: env.demoMode
      ? "simulated"
      : env.whatsappConfigured
        ? "configured"
        : "not_configured",
    webhookConfigured: env.whatsappWebhookConfigured,
    mapping: "Leaflet with OpenStreetMap tiles",
    demoMode: env.demoMode,
    rateLimitRemaining: rateLimit.remaining,
    timestamp: new Date().toISOString(),
    disclaimer: SAFETY_DISCLAIMER,
  });
});
