import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  createSessionCookieOptions,
  hashScryptPassword,
  isValidScryptPasswordHash,
  keyedCodeHash,
  signSession,
  verifyAuthorityCredentials,
  verifyKeyedCode,
  verifyScryptPassword,
  verifySession,
} = jiti("../src/lib/auth-protocol.ts");

const secret = "test-session-secret-that-is-longer-than-32-characters";
const now = Date.parse("2026-07-30T10:00:00Z");

test("a protected authority session accepts a valid signed token", () => {
  const token = signSession("authority", "rescue-admin", secret, 3_600, now);
  assert.deepEqual(verifySession(token, secret, now), {
    role: "authority",
    subject: "rescue-admin",
    expiresAt: Math.floor(now / 1_000) + 3_600,
  });
});

test("a protected authority session rejects invalid and expired tokens", () => {
  const token = signSession("authority", "rescue-admin", secret, 3_600, now);
  assert.equal(verifySession(`${token}x`, secret, now), null);
  assert.equal(verifySession(token, secret, now + 3_601_000), null);
});

test("authority credentials accept the correct username and password", () => {
  const salt = randomBytes(16);
  const encoded = hashScryptPassword("correct horse battery staple", salt);
  assert.equal(
    verifyAuthorityCredentials(
      "rescue-admin",
      "correct horse battery staple",
      "rescue-admin",
      encoded,
    ),
    true,
  );
});

test("authority credentials reject an incorrect username or password", () => {
  const encoded = hashScryptPassword(
    "correct horse battery staple",
    Buffer.alloc(16, 7),
  );
  assert.equal(
    verifyAuthorityCredentials(
      "wrong-admin",
      "correct horse battery staple",
      "rescue-admin",
      encoded,
    ),
    false,
  );
  assert.equal(
    verifyAuthorityCredentials(
      "rescue-admin",
      "wrong password",
      "rescue-admin",
      encoded,
    ),
    false,
  );
});

test("authority credentials reject empty input", () => {
  const encoded = hashScryptPassword("test password", Buffer.alloc(16, 5));
  assert.equal(verifyAuthorityCredentials("", "test password", "admin", encoded), false);
  assert.equal(verifyAuthorityCredentials("admin", "", "admin", encoded), false);
});

test("authority username is trimmed but the password is not modified", () => {
  const encoded = hashScryptPassword(" password ", Buffer.alloc(16, 3));
  assert.equal(
    verifyAuthorityCredentials("  rescue-admin  ", " password ", "rescue-admin", encoded),
    true,
  );
  assert.equal(
    verifyAuthorityCredentials("rescue-admin", "password", "rescue-admin", encoded),
    false,
  );
});

test("malformed authority password hashes fail safely", () => {
  const malformed = [
    "invalid",
    "scrypt:not-hex:not-hex",
    "scrypt:00:00",
    `scrypt:${"00".repeat(16)}:${"00".repeat(63)}`,
  ];
  for (const encoded of malformed) {
    assert.equal(isValidScryptPasswordHash(encoded), false);
    assert.equal(verifyScryptPassword("password", encoded), false);
  }
});

test("successful authority login uses a persistent secure cookie shape", () => {
  assert.deepEqual(createSessionCookieOptions("signed-token", 3_600, false), {
    name: "argus_session",
    value: "signed-token",
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 3_600,
  });
});

test("authority password hashes accept legacy dollar separators", () => {
  const encoded = hashScryptPassword("correct horse battery staple", Buffer.alloc(16, 9));
  const legacy = encoded.replaceAll(":", "$");
  assert.equal(verifyScryptPassword("wrong password", encoded), false);
  assert.equal(verifyScryptPassword("correct horse battery staple", legacy), true);
});

test("trekker pairing hashes isolate credentials from stored values", () => {
  const stored = keyedCodeHash("ARGUS-pairing-code", secret);
  assert.notEqual(stored, "ARGUS-pairing-code");
  assert.equal(verifyKeyedCode("ARGUS-pairing-code", stored, secret), true);
  assert.equal(verifyKeyedCode("another-code", stored, secret), false);
});

test("protected layouts enforce server-side authority and trekker sessions", () => {
  const authorityLayout = readFileSync(
    new URL("../src/app/authority/(protected)/layout.tsx", import.meta.url),
    "utf8",
  );
  const trekkerPage = readFileSync(
    new URL("../src/app/trekker/dashboard/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(authorityLayout, /currentSession/);
  assert.match(authorityLayout, /redirect\("\/authority\/login"\)/);
  assert.match(trekkerPage, /currentSession/);
  assert.match(trekkerPage, /redirect\("\/trekker\/login"\)/);
});

test("trekker SOS confirmation is single-flight and updates active state", () => {
  const portal = readFileSync(
    new URL("../src/components/trekker/trekker-portal.tsx", import.meta.url),
    "utf8",
  );
  assert.match(portal, /role="dialog"/);
  assert.match(portal, /Confirm and activate SOS/);
  assert.match(portal, /type="button" disabled=\{isActivatingSos/);
  assert.match(portal, /sosSubmissionInFlight\.current/);
  assert.match(portal, /setIsConfirmModalOpen\(false\)/);
  assert.match(portal, /setActiveSos\(confirmedSos\)/);
  assert.match(portal, /Activating SOS…/);
  assert.match(portal, /activeSos \? \(/);
  assert.doesNotMatch(portal, /useEffect[\s\S]{0,500}setIsConfirmModalOpen\(true\)/);
  assert.match(portal, /\/api\/sos/);
  assert.match(portal, /reason instanceof Error/);
  assert.match(portal, /Location data is unavailable|SafetyMap/);
});

test("portal device migration stores pairing hashes and protects RLS", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/007_portal_devices.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /pairing_code_hash text not null/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.devices/);
  assert.doesNotMatch(migration, /pairing_code text/);
});

test("portal requests forward session cookies and do not expose admin keys", () => {
  const api = readFileSync(
    new URL("../src/lib/portal-api.ts", import.meta.url),
    "utf8",
  );
  assert.match(api, /credentials: "include"/);
  assert.doesNotMatch(api, /ADMIN_API_KEY|x-admin-api-key/);
});

test("authority pages distinguish empty collections from request failures", () => {
  const portal = readFileSync(
    new URL("../src/components/authority/authority-portal.tsx", import.meta.url),
    "utf8",
  );
  assert.match(portal, /No active emergencies/);
  assert.match(portal, /No devices are registered yet/);
  assert.match(portal, /No notification attempts yet/);
  assert.match(portal, /ErrorState message=\{error\}/);
});

test("shared API authorization distinguishes missing sessions from wrong roles", () => {
  const auth = readFileSync(
    new URL("../src/lib/api-auth.ts", import.meta.url),
    "utf8",
  );
  assert.match(auth, /authorityAccessError/);
  assert.match(auth, /trekkerAccessError/);
  assert.match(auth, /authorityOrTrekkerAccessError/);
  assert.match(auth, /"UNAUTHENTICATED"[\s\S]*401/);
  assert.match(auth, /"FORBIDDEN"[\s\S]*403/);
  assert.doesNotMatch(auth, /SUPABASE_SERVICE_ROLE_KEY|WHATSAPP_ACCESS_TOKEN/);
});
