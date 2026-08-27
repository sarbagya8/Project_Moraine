import { failure, readJson, success } from "@/lib/api-response";
import { env } from "@/lib/env";
import {
  createSessionToken,
  sessionCookie,
  verifyPairingCode,
} from "@/lib/portal-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { withRequestContext } from "@/lib/request-context";
import { getSupabaseAuthClient, getSupabaseServer } from "@/lib/supabase/server";

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
      `Too many sign-in attempts. Try again in ${limit.retryAfter} seconds.`,
      429,
    );
  }
  if (env.sessionSecret.length < 32) {
    return failure("AUTH_NOT_CONFIGURED", "User login is not configured.", 503);
  }
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as Record<string, unknown>;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const trekkerId =
    typeof body?.trekkerId === "string" ? body.trekkerId.trim() : "";
  const pairingCode =
    typeof body?.pairingCode === "string" ? body.pairingCode.trim() : "";
  if ("email" in body || "password" in body) {
    if (!email || !password) return failure("VALIDATION_ERROR", "Email and password are required.", 400);
    try {
      const { data: auth, error: authError } = await getSupabaseAuthClient().auth.signInWithPassword({ email, password });
      if (authError || !auth.user) return failure("INVALID_CREDENTIALS", "Email or password is incorrect.", 401);
      const { data: profile, error: profileError } = await getSupabaseServer()
        .from("trekkers")
        .select("id,is_active,role")
        .eq("auth_user_id", auth.user.id)
        .maybeSingle<{ id: string; is_active: boolean; role: string }>();
      if (profileError) throw profileError;
      if (!profile?.is_active || profile.role !== "user") {
        return failure("ACCOUNT_UNAVAILABLE", "This User account is inactive or unavailable.", 403);
      }
      return signedIn(profile.id);
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (["42703", "PGRST204"].includes(code || "")) {
        return failure("ACCOUNT_SCHEMA_REQUIRED", "Email accounts are not enabled yet. Apply the account migration or use legacy pairing login.", 503);
      }
      return failure("AUTH_UNAVAILABLE", "User login is temporarily unavailable.", 503);
    }
  }
  if (!trekkerId || !pairingCode) {
    return failure(
      "VALIDATION_ERROR",
      "User ID and pairing code are required.",
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
        "The user ID or pairing code is incorrect.",
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
      "User login is temporarily unavailable.",
      503,
    );
  }
  },
);
