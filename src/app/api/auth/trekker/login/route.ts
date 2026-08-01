import { failure, readJson, success } from "@/lib/api-response";
import { env } from "@/lib/env";
import {
  createSessionToken,
  sessionCookie,
  verifyPairingCode,
} from "@/lib/portal-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { withRequestContext } from "@/lib/request-context";
import { getSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

function signedIn(trekkerId: string) {
  const response = success({ role: "trekker", trekkerId });
  response.cookies.set(
    sessionCookie(createSessionToken("trekker", trekkerId)),
  );
  return response;
}

export const POST = withRequestContext(
  "/api/auth/trekker/login",
  async (request) => {
  const limit = checkRateLimit(request, "trekker-login", 10, 15 * 60_000);
  if (!limit.allowed) {
    return failure(
      "RATE_LIMITED",
      `Too many pairing attempts. Try again in ${limit.retryAfter} seconds.`,
      429,
    );
  }
  if (env.sessionSecret.length < 32) {
    return failure("AUTH_NOT_CONFIGURED", "Trekker login is not configured.", 503);
  }
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as Record<string, unknown>;
  const trekkerId =
    typeof body?.trekkerId === "string" ? body.trekkerId.trim() : "";
  const pairingCode =
    typeof body?.pairingCode === "string" ? body.pairingCode.trim() : "";
  if (!trekkerId || !pairingCode) {
    return failure(
      "VALIDATION_ERROR",
      "Trekker ID and pairing code are required.",
      400,
    );
  }
  try {
    const { data, error } = await getSupabaseServer()
      .from("devices")
      .select("trekker_id, pairing_code_hash, is_active, trekkers!inner(is_active)")
      .eq("trekker_id", trekkerId)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    const trekker = data?.trekkers as unknown as { is_active?: boolean } | null;
    if (
      !data ||
      !trekker?.is_active ||
      !verifyPairingCode(pairingCode, data.pairing_code_hash)
    ) {
      return failure(
        "INVALID_PAIRING",
        "The trekker ID or pairing code is incorrect.",
        401,
      );
    }
    return signedIn(trekkerId);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "PGRST205" || code === "42P01") {
      return failure(
        "DATABASE_MIGRATIONS_REQUIRED",
        "The ARGUS database migrations have not been applied.",
        503,
      );
    }
    return failure(
      "DATABASE_ERROR",
      "Trekker login is temporarily unavailable.",
      503,
    );
  }
  },
);
