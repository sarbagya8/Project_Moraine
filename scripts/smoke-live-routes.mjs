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
const responderCookie = `argus_session=${sessionToken("authority", "route-smoke", secret)}`;
const userCookie = `argus_session=${sessionToken("trekker", "TRK-DEMO-001", secret)}`;

const checks = [
  ["Landing page", "/", ""],
  ["User dashboard", "/user/dashboard", userCookie],
  ["User overview API", "/api/trekker/me", userCookie],
  ["Responder dashboard", "/responder/dashboard", responderCookie],
  ["Responder overview API", "/api/authority/overview", responderCookie],
  ["Active cases", "/responder/cases", responderCookie],
  ["Users", "/responder/users", responderCookie],
  ["Devices", "/responder/devices", responderCookie],
  ["Notifications", "/responder/notifications", responderCookie],
  ["Settings", "/responder/settings", responderCookie],
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

const redirects = [
  ["Old User URL", "/trekker/dashboard", "/user/dashboard"],
  ["Old Responder URL", "/authority/dashboard", "/responder/dashboard"],
  ["Old case URL", "/authority/emergencies", "/responder/cases"],
];
for (const [label, path, destination] of redirects) {
  const response = await fetch(`${base}${path}`, { redirect: "manual" });
  const location = response.headers.get("location") || "";
  const body = await response.text();
  const passed = (response.status >= 300 && response.status < 400 && location.endsWith(destination)) || (response.status === 200 && body.includes(destination));
  console.info(`${passed ? "PASS" : "FAIL"} ${label}: HTTP ${response.status} → ${location || "no location"}`);
  if (!passed) failed = true;
}

for (const [label, path, destination] of [
  ["User protection", "/user/dashboard", "/user/login"],
  ["Responder protection", "/responder/dashboard", "/responder/login"],
]) {
  const response = await fetch(`${base}${path}`, { redirect: "manual" });
  const location = response.headers.get("location") || "";
  const body = await response.text();
  const passed = (response.status >= 300 && response.status < 400 && location.endsWith(destination)) || (response.status === 200 && body.includes(destination));
  console.info(`${passed ? "PASS" : "FAIL"} ${label}: HTTP ${response.status} → ${location || "no location"}`);
  if (!passed) failed = true;
}

for (const [label, path, cookie, expected, rejected] of [
  ["Responder cannot enter User routes", "/user/dashboard", responderCookie, "/user/login", "/responder/dashboard"],
  ["User cannot enter Responder routes", "/responder/dashboard", userCookie, "/responder/login", "/user/dashboard"],
  ["Responder may open User login", "/user/login", responderCookie, "User sign in", "/responder/dashboard"],
  ["User may open Responder login", "/responder/login", userCookie, "Responder sign in", "/user/dashboard"],
]) {
  const response = await fetch(`${base}${path}`, { headers: { cookie }, redirect: "manual" });
  const location = response.headers.get("location") || "";
  const body = await response.text();
  const passed = ((response.status >= 300 && response.status < 400 && location.endsWith(expected)) || (response.status === 200 && body.includes(expected))) && !location.endsWith(rejected);
  console.info(`${passed ? "PASS" : "FAIL"} ${label}: HTTP ${response.status} → ${location || "rendered login"}`);
  if (!passed) failed = true;
}

const [userResponse, responderResponse] = await Promise.all([
  fetch(`${base}/api/trekker/me`, { headers: { cookie: userCookie } }).then((response) => response.json()),
  fetch(`${base}/api/authority/overview`, { headers: { cookie: responderCookie } }).then((response) => response.json()),
]);
const userData = userResponse.data;
const responderUser = responderResponse.data?.trekkers?.find((item) => item.id === userData?.trekker?.id);
const telemetryFields = ["deviceId", "heartRate", "spo2", "sensorState", "pressure", "altitude", "temperature", "fallDetected", "fallType", "sosCountdown", "physicalSos", "averageSpeed", "distance", "capturedAt"];
const telemetryMatches = (!userData?.latestReading && !responderUser?.latestReading) || (Boolean(userData?.latestReading && responderUser?.latestReading) && telemetryFields.every((field) => Object.is(userData.latestReading[field], responderUser.latestReading[field])));
console.info(`${telemetryMatches ? "PASS" : "FAIL"} Shared telemetry truth: ${telemetryMatches ? telemetryFields.join(", ") : "User and Responder values differ"}`);
if (!telemetryMatches && userData?.latestReading && responderUser?.latestReading) {
  console.info(JSON.stringify(Object.fromEntries(telemetryFields.filter((field) => !Object.is(userData.latestReading[field], responderUser.latestReading[field])).map((field) => [field, { user: userData.latestReading[field], responder: responderUser.latestReading[field] }])), null, 2));
}
if (!telemetryMatches && (!userData?.latestReading || !responderUser?.latestReading)) {
  console.info(`INFO User reading: ${userData?.latestReading ? "present" : "unavailable"}; Responder reading: ${responderUser?.latestReading ? "present" : "unavailable"}`);
}
if (!telemetryMatches) failed = true;
const locationMatches = (!userData?.latestLocation && !responderUser?.latestLocation) || (Boolean(userData?.latestLocation && responderUser?.latestLocation) && ["latitude", "longitude", "accuracyMeters", "capturedAt"].every((field) => Object.is(userData.latestLocation[field], responderUser.latestLocation[field])));
console.info(`${locationMatches ? "PASS" : "FAIL"} Shared GPS truth`);
if (!locationMatches) failed = true;
const firstCase = responderResponse.data?.emergencies?.[0];
if (firstCase?.id) {
  const [casePage, caseApi] = await Promise.all([
    fetch(`${base}/responder/cases/${firstCase.id}`, { headers: { cookie: responderCookie } }),
    fetch(`${base}/api/rescue/${firstCase.id}`, { headers: { cookie: responderCookie } }),
  ]);
  const caseBody = await caseApi.json();
  const passed = casePage.ok && caseApi.ok && caseBody.data?.sos?.id === firstCase.id;
  console.info(`${passed ? "PASS" : "FAIL"} Responder case details and timeline API`);
  if (!passed) failed = true;
  console.info(`INFO Case workflow schema: ${caseBody.data?.caseWorkflowReady ? "ready" : "pending; core case fallback active"}`);
}
if (userData?.latestLocation) {
  const careResponse = await fetch(`${base}/api/care/nearby?latitude=${userData.latestLocation.latitude}&longitude=${userData.latestLocation.longitude}`, { headers: { cookie: userCookie } });
  const careBody = await careResponse.json();
  const passed = careResponse.ok && Array.isArray(careBody.data?.facilities);
  console.info(`${passed ? "PASS" : "FAIL"} Nearby Care provider: ${careBody.data?.available ? `${careBody.data.facilities.length} mapped result(s)` : careBody.data?.message || "unavailable"}`);
  if (!passed) failed = true;
}
console.info(`INFO Optional health schema: ${userData?.healthProfileSchemaReady ? "ready" : "pending; graceful fallback active"}`);
if (failed) process.exitCode = 1;
