import "server-only";
import { timingSafeEqual } from "node:crypto";
import { failure } from "./api-response";
import { env } from "./env";
import { requestSession } from "./portal-auth";

export function isSecretEqual(
  supplied: string | null,
  expected: string | undefined,
) {
  if (!supplied || !expected) return false;
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(suppliedBuffer, expectedBuffer);
}

export function isDeviceAuthorized(request: Request) {
  return isSecretEqual(
    request.headers.get("x-device-api-key")?.trim() || null,
    process.env.DEVICE_API_KEY?.trim(),
  );
}

function hasAdminApiKey(request: Request) {
  return isSecretEqual(
    request.headers.get("x-admin-api-key")?.trim() || null,
    process.env.ADMIN_API_KEY?.trim(),
  );
}

export function authorityAccessError(request: Request) {
  if (!env.administrativeAuthConfigured) {
    return failure(
      "ADMIN_AUTH_NOT_CONFIGURED",
      "Administrative authentication is not configured.",
      503,
    );
  }
  const session = requestSession(request);
  if (session?.role === "authority" || hasAdminApiKey(request)) return null;
  if (!session) return failure("UNAUTHENTICATED", "Sign in is required.", 401);
  return failure("FORBIDDEN", "Responder access is required.", 403);
}

export function trekkerAccessError(request: Request, trekkerId?: string) {
  const session = requestSession(request);
  if (!session) return failure("UNAUTHENTICATED", "Sign in is required.", 401);
  if (
    session.role !== "trekker" ||
    (trekkerId !== undefined && session.subject !== trekkerId)
  ) {
    return failure("FORBIDDEN", "User access is limited to your own profile.", 403);
  }
  return null;
}

export function authorityOrTrekkerAccessError(
  request: Request,
  trekkerId: string,
) {
  const session = requestSession(request);
  if (
    hasAdminApiKey(request) ||
    session?.role === "authority" ||
    (session?.role === "trekker" && session.subject === trekkerId)
  ) {
    return null;
  }
  if (!session) return failure("UNAUTHENTICATED", "Sign in is required.", 401);
  return failure("FORBIDDEN", "Access to this user is not allowed.", 403);
}
