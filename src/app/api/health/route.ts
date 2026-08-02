import { success } from "@/lib/api-response";
import { SAFETY_DISCLAIMER } from "@/lib/disclaimer";
import { env } from "@/lib/env";
import { isHardwareMigrationError } from "@/lib/database-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { withRequestContext } from "@/lib/request-context";
import { getSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function databaseProbe() {
  if (!env.databaseConfigured) {
    return { status: "not_configured" as const, hardwareSchemaReady: false };
  }

  try {
    const db = getSupabaseServer();
    const baseline = await Promise.race([
      db.from("trekkers").select("id", { head: true, count: "exact" }).limit(1),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("DATABASE_PROBE_TIMEOUT")), 8_000),
      ),
    ]);
    if (baseline.error) {
      return { status: "unavailable" as const, hardwareSchemaReady: false };
    }

    const hardware = await db
      .from("devices")
      .select("firmware_version")
      .limit(1);
    if (!hardware.error) {
      return { status: "reachable" as const, hardwareSchemaReady: true };
    }
    if (isHardwareMigrationError(hardware.error)) {
      return { status: "reachable" as const, hardwareSchemaReady: false };
    }
    return { status: "unavailable" as const, hardwareSchemaReady: false };
  } catch {
    return { status: "unavailable" as const, hardwareSchemaReady: false };
  }
}

export const GET = withRequestContext("/api/health", async (request) => {
  const rateLimit = checkRateLimit(request, "health", 60, 60_000);
  const deep = new URL(request.url).searchParams.get("deep") === "true";
  const database = deep
    ? await databaseProbe()
    : { status: "not_checked" as const, hardwareSchemaReady: null };

  return success({
    service: "ARGUS API",
    status: "ok",
    databaseConfigured: env.databaseConfigured,
    databaseStatus: database.status,
    hardwareSchemaReady: database.hardwareSchemaReady,
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
