import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export type SignedSession =
  | { role: "authority"; subject: string; expiresAt: number }
  | { role: "trekker"; subject: string; expiresAt: number };

function equalBuffers(left: Buffer, right: Buffer) {
  return left.length === right.length && timingSafeEqual(left, right);
}

const SCRYPT_SALT_BYTES = 16;
const SCRYPT_KEY_BYTES = 64;
const HEX = /^[0-9a-f]+$/i;

export const SESSION_COOKIE_NAME = "argus_session";

function parseScryptPasswordHash(encodedHash: string) {
  const separator = encodedHash.startsWith("scrypt:")
    ? ":"
    : encodedHash.startsWith("scrypt$")
      ? "$"
      : null;
  if (!separator) return null;

  const [algorithm, saltHex, expectedHex, extra] = encodedHash.split(separator);
  if (
    algorithm !== "scrypt" ||
    extra ||
    saltHex.length !== SCRYPT_SALT_BYTES * 2 ||
    expectedHex.length !== SCRYPT_KEY_BYTES * 2 ||
    !HEX.test(saltHex) ||
    !HEX.test(expectedHex)
  ) {
    return null;
  }

  return {
    salt: Buffer.from(saltHex, "hex"),
    expected: Buffer.from(expectedHex, "hex"),
  };
}

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signSession(
  role: SignedSession["role"],
  subject: string,
  secret: string,
  maxAgeSeconds: number,
  now = Date.now(),
) {
  if (secret.length < 32) throw new Error("SESSION_SECRET_REQUIRED");
  const payload = Buffer.from(
    JSON.stringify({
      role,
      subject,
      expiresAt: Math.floor(now / 1_000) + maxAgeSeconds,
    }),
  ).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function verifySession(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): SignedSession | null {
  if (!token || secret.length < 32) return null;
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) return null;
  if (
    !equalBuffers(
      Buffer.from(suppliedSignature),
      Buffer.from(signature(payload, secret)),
    )
  ) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Partial<SignedSession>;
    if (
      (parsed.role !== "authority" && parsed.role !== "trekker") ||
      typeof parsed.subject !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= Math.floor(now / 1_000)
    ) {
      return null;
    }
    return parsed as SignedSession;
  } catch {
    return null;
  }
}

export function verifyScryptPassword(password: string, encodedHash: string) {
  const parsed = parseScryptPasswordHash(encodedHash);
  if (!parsed) return false;
  try {
    const actual = scryptSync(password, parsed.salt, SCRYPT_KEY_BYTES);
    return equalBuffers(actual, parsed.expected);
  } catch {
    return false;
  }
}

export function isValidScryptPasswordHash(encodedHash: string) {
  return parseScryptPasswordHash(encodedHash) !== null;
}

export function hashScryptPassword(
  password: string,
  salt = randomBytes(SCRYPT_SALT_BYTES),
) {
  if (!password) throw new Error("PASSWORD_REQUIRED");
  if (salt.length !== SCRYPT_SALT_BYTES) throw new Error("INVALID_SCRYPT_SALT");
  const derived = scryptSync(password, salt, SCRYPT_KEY_BYTES);
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}

export function verifyAuthorityCredentials(
  username: string,
  password: string,
  expectedUsername: string,
  encodedHash: string,
) {
  const usernameMatches = equalBuffers(
    Buffer.from(username.trim()),
    Buffer.from(expectedUsername),
  );
  const passwordMatches = verifyScryptPassword(password, encodedHash);
  return usernameMatches && passwordMatches;
}

export function createSessionCookieOptions(
  token: string,
  maxAge: number,
  secure: boolean,
) {
  return {
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge,
  };
}

export function keyedCodeHash(code: string, secret: string) {
  if (secret.length < 32) throw new Error("SESSION_SECRET_REQUIRED");
  return createHmac("sha256", secret).update(code.trim()).digest("hex");
}

export function verifyKeyedCode(code: string, expectedHash: string, secret: string) {
  return equalBuffers(
    Buffer.from(keyedCodeHash(code, secret)),
    Buffer.from(expectedHash),
  );
}
