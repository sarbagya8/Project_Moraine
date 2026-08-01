import { failure, readJson, success } from "@/lib/api-response";
import { env } from "@/lib/env";
import {
  createSessionToken,
  sessionCookie,
  verifyAuthorityPassword,
} from "@/lib/portal-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { logError, withRequestContext } from "@/lib/request-context";

export const runtime = "nodejs";

export const POST = withRequestContext(
  "/api/auth/authority/login",
  async (request, _routeContext, context) => {
    const limit = checkRateLimit(request, "authority-login", 8, 15 * 60_000);
    if (!limit.allowed) {
      return failure(
        "RATE_LIMITED",
        `Too many login attempts. Try again in ${limit.retryAfter} seconds.`,
        429,
      );
    }

    const parsed = await readJson(request);
    if (parsed.error) return parsed.error;
    const body = parsed.data as Record<string, unknown>;
    const username = typeof body?.username === "string" ? body.username.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!username || !password) {
      return failure(
        "INVALID_INPUT",
        "Username and password are required.",
        400,
      );
    }

    if (!env.portalAuthConfigured) {
      logError(context, "authority_auth.configuration_invalid", {
        usernameConfigured: Boolean(env.authorityUsername),
        passwordHashConfigured: Boolean(env.authorityPasswordHash),
        passwordHashValid: env.authorityPasswordHashValid,
        sessionSecretValid: env.sessionSecret.length >= 32,
      });
      return failure(
        "AUTH_CONFIGURATION_ERROR",
        "Authority login could not be completed.",
        500,
      );
    }

    if (!verifyAuthorityPassword(username, password)) {
      return failure(
        "INVALID_CREDENTIALS",
        "Username or password is incorrect.",
        401,
      );
    }

    const response = success({ role: "authority" });
    response.cookies.set(
      sessionCookie(createSessionToken("authority", env.authorityUsername)),
    );
    return response;
  },
);
