import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";

async function loadEnvironmentFile(path) {
  try {
    const contents = await readFile(path, "utf8");
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator < 1) continue;
      const name = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(name in process.env)) process.env[name] = value;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function sessionToken(role, subject, secret) {
  const payload = Buffer.from(JSON.stringify({
    role,
    subject,
    expiresAt: Math.floor(Date.now() / 1000) + 300,
  })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

await loadEnvironmentFile(".env.local");
const secret = process.env.SESSION_SECRET?.trim();
if (!secret || secret.length < 32) throw new Error("SESSION_SECRET is not configured.");
const base = (process.env.SMOKE_BASE_URL || "http://localhost:3001").replace(/\/$/, "");
const authorityCookie = `argus_session=${sessionToken("authority", "route-smoke", secret)}`;
const trekkerCookie = `argus_session=${sessionToken("trekker", "TRK-DEMO-001", secret)}`;

const checks = [
  ["Trekker dashboard", "/trekker/dashboard", trekkerCookie],
  ["Trekker overview API", "/api/trekker/me", trekkerCookie],
  ["Authority overview", "/authority/dashboard", authorityCookie],
  ["Authority overview API", "/api/authority/overview", authorityCookie],
  ["Emergencies", "/authority/emergencies", authorityCookie],
  ["Trekkers", "/authority/trekkers", authorityCookie],
  ["Devices", "/authority/devices", authorityCookie],
  ["Notifications", "/authority/notifications", authorityCookie],
  ["Settings", "/authority/settings", authorityCookie],
];

let failed = false;
for (const [label, path, cookie] of checks) {
  const response = await fetch(`${base}${path}`, { headers: { cookie }, redirect: "manual" });
  const body = await response.text();
  const migrationFailure = body.includes("DATABASE_MIGRATIONS_REQUIRED") || body.includes("database migrations have not been applied");
  const passed = response.ok && !migrationFailure;
  console.info(`${passed ? "PASS" : "FAIL"} ${label}: HTTP ${response.status}${migrationFailure ? " migration-gated" : ""}`);
  if (!passed) {
    try {
      const envelope = JSON.parse(body);
      console.info(`  ${envelope?.error?.code || "unknown"}: ${envelope?.error?.message || "No safe error message"}`);
    } catch {
      console.info("  Non-JSON response");
    }
    failed = true;
  }
}
if (failed) process.exitCode = 1;
