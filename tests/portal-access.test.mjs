import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  keyedCodeHash,
  signSession,
  verifyKeyedCode,
  verifyScryptPassword,
  verifySession,
} = jiti("../src/lib/auth-protocol.ts");

const secret = "test-session-secret-that-is-longer-than-32-characters";
const now = Date.parse("2026-07-30T10:00:00Z");

test("authority sessions verify, expire, and reject tampering", () => {
  const token = signSession("authority", "rescue-admin", secret, 3_600, now);
  assert.deepEqual(verifySession(token, secret, now), {
    role: "authority",
    subject: "rescue-admin",
    expiresAt: Math.floor(now / 1_000) + 3_600,
  });
  assert.equal(verifySession(`${token}x`, secret, now), null);
  assert.equal(verifySession(token, secret, now + 3_601_000), null);
});

test("authority password hashes accept the right password only", () => {
  const salt = randomBytes(16);
  const derived = scryptSync("correct horse battery staple", salt, 64);
  const encoded = `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
  assert.equal(
    verifyScryptPassword("correct horse battery staple", encoded),
    true,
  );
  assert.equal(verifyScryptPassword("wrong password", encoded), false);
  assert.equal(verifyScryptPassword("password", "invalid"), false);
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

test("trekker SOS requires confirmation and reports backend failures", () => {
  const portal = readFileSync(
    new URL("../src/components/trekker/trekker-portal.tsx", import.meta.url),
    "utf8",
  );
  assert.match(portal, /role="dialog"/);
  assert.match(portal, /Confirm and activate SOS/);
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
