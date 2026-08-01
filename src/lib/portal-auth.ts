import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import {
  createSessionCookieOptions,
  keyedCodeHash,
  SESSION_COOKIE_NAME,
  signSession,
  verifyAuthorityCredentials,
  verifyKeyedCode,
  verifySession,
  type SignedSession,
} from "./auth-protocol";
import { env } from "./env";

export const SESSION_COOKIE = SESSION_COOKIE_NAME;

export type PortalSession = SignedSession;

export function createSessionToken(
  role: PortalSession["role"],
  subject: string,
  now = Date.now(),
) {
  return signSession(
    role,
    subject,
    env.sessionSecret,
    env.sessionMaxAgeSeconds,
    now,
  );
}

export function readSessionToken(
  token: string | undefined,
  now = Date.now(),
): PortalSession | null {
  return verifySession(token, env.sessionSecret, now);
}

function cookieValue(request: Request) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(valueParts.join("="));
  }
  return undefined;
}

export function requestSession(request: Request) {
  return readSessionToken(cookieValue(request));
}

export async function currentSession() {
  return readSessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

export function sessionCookie(token: string) {
  return createSessionCookieOptions(
    token,
    env.sessionMaxAgeSeconds,
    process.env.NODE_ENV === "production",
  );
}

export function verifyAuthorityPassword(username: string, password: string) {
  if (!env.portalAuthConfigured) return false;
  return verifyAuthorityCredentials(
    username,
    password,
    env.authorityUsername,
    env.authorityPasswordHash,
  );
}

export function hashPairingCode(code: string) {
  return keyedCodeHash(code, env.sessionSecret);
}

export function createPairingCode() {
  return randomBytes(9).toString("base64url");
}

export function verifyPairingCode(code: string, expectedHash: string) {
  return verifyKeyedCode(code, expectedHash, env.sessionSecret);
}
