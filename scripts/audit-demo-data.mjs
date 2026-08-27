import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

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
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) value = value.slice(1, -1);
      if (!(name in process.env)) process.env[name] = value;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function maskPhone(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, "");
  return digits ? `***${digits.slice(-4)}` : "***";
}

function summarize(table, rows) {
  console.info(`\n${table}: ${rows.length} row(s)`);
  for (const row of rows) console.info(JSON.stringify(row));
}

await loadEnvironmentFile(".env.local");
await loadEnvironmentFile(".env");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) throw new Error("Supabase configuration is missing.");

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function select(table, columns) {
  const { data, error } = await db.from(table).select(columns).limit(500);
  if (error) throw new Error(`${table}: ${error.code || "unknown"} ${error.message}`);
  return data || [];
}

const [trekkers, devices, readings, locations, symptoms, sos, attempts] =
  await Promise.all([
    select("trekkers", "id, is_active, created_at"),
    select("devices", "id, trekker_id, is_active, last_seen_at, created_at"),
    select("sensor_readings", "id, trekker_id, device_id, heart_rate, spo2, altitude, temperature, sensor_state, captured_at, request_id"),
    select("locations", "id, trekker_id, source, captured_at, request_id"),
    select("symptom_reports", "id, trekker_id, symptom, severity, notes, created_at, request_id"),
    select("sos_events", "id, trekker_id, source, status, sms_status, created_at, request_id"),
    select("sms_attempts", "id, sos_event_id, phone_number, provider, status, created_at, request_id"),
  ]);

if (process.argv.includes("--development-history")) {
  const accountIds = new Set(["TRK-DEMO-001", "TRK-REPRO-001"]);
  const developmentCases = sos.filter((row) => accountIds.has(row.trekker_id));
  const caseIds = new Set(developmentCases.map((row) => row.id));
  console.info(JSON.stringify({
    classifiedForRemoval: {
      sensorReadings: readings.filter((row) => accountIds.has(row.trekker_id)).length,
      zeroValueReadings: readings.filter((row) => accountIds.has(row.trekker_id) && [row.heart_rate, row.spo2, row.altitude, row.temperature].some((value) => value === 0)).length,
      noFingerReadings: readings.filter((row) => accountIds.has(row.trekker_id) && row.sensor_state === "no_finger").length,
      locations: locations.filter((row) => accountIds.has(row.trekker_id)).length,
      symptoms: symptoms.filter((row) => accountIds.has(row.trekker_id)).length,
      cases: caseIds.size,
      notificationAttempts: attempts.filter((row) => caseIds.has(row.sos_event_id)).length,
      reproDevices: devices.filter((row) => row.id === "ARGUS-REPRO-01" && row.trekker_id === "TRK-REPRO-001").length,
      reproUsers: trekkers.filter((row) => row.id === "TRK-REPRO-001").length,
    },
    symptomKinds: [...new Set(symptoms.filter((row) => accountIds.has(row.trekker_id)).map((row) => row.symptom))].sort(),
    caseStatuses: Object.fromEntries([...new Set(sos.map((row) => row.status))].sort().map((status) => [status, sos.filter((row) => accountIds.has(row.trekker_id) && row.status === status).length])),
    notificationStatuses: Object.fromEntries([...new Set(attempts.map((row) => row.status))].sort().map((status) => [status, attempts.filter((row) => caseIds.has(row.sos_event_id) && row.status === status).length])),
    activeCases: developmentCases.filter((row) => row.status === "active").map(({ id, source, created_at, request_id }) => ({ id, source, created_at, request_id })),
    preserved: {
      user: trekkers.find((row) => row.id === "TRK-DEMO-001") || null,
      device: devices.find((row) => row.id === "ARGUS-ESP32-DEMO-01" && row.trekker_id === "TRK-DEMO-001") || null,
    },
  }, null, 2));
  process.exit(0);
}

if (process.argv.includes("--cleanup-candidates")) {
  const seededCases = sos.filter((row) =>
    row.source === "demo" ||
    row.request_id?.startsWith("argus-demo-") ||
    row.trekker_id === "TRK-REPRO-001" ||
    row.request_id?.startsWith("repro-"),
  );
  const legacyResolvedTests = sos.filter((row) =>
    row.trekker_id === "TRK-DEMO-001" &&
    row.status === "resolved" &&
    row.created_at < "2026-08-03T00:00:00Z" &&
    !seededCases.some((candidate) => candidate.id === row.id),
  );
  const removedIds = new Set([...seededCases, ...legacyResolvedTests].map((row) => row.id));
  const cleanupCounts = {
    users: trekkers.filter((row) => row.id === "TRK-REPRO-001").length,
    devices: devices.filter((row) => row.id === "ARGUS-REPRO-01" && row.trekker_id === "TRK-REPRO-001").length,
    readings: readings.filter((row) => row.trekker_id === "TRK-REPRO-001" || row.request_id?.startsWith("argus-demo-reading-")).length,
    locations: locations.filter((row) => row.trekker_id === "TRK-REPRO-001" || row.source === "demo" || row.request_id?.startsWith("argus-demo-location-")).length,
    symptoms: symptoms.filter((row) => row.trekker_id === "TRK-REPRO-001" || row.request_id === "argus-demo-symptom").length,
    cases: removedIds.size,
    notifications: attempts.filter((row) => removedIds.has(row.sos_event_id) || ["demo", "whatsapp_demo"].includes(row.provider) || row.request_id?.startsWith("argus-demo-")).length,
  };
  console.info(JSON.stringify({
    cleanupCounts,
    seededCaseIds: seededCases.map((row) => row.id),
    legacyResolvedTestCaseIds: legacyResolvedTests.map((row) => row.id),
    preservedCases: sos.filter((row) => !removedIds.has(row.id)).map(({ id, status, created_at }) => ({ id, status, created_at })),
  }, null, 2));
  process.exit(0);
}

summarize("trekkers", trekkers);
summarize("devices", devices);
summarize("sensor_readings", readings.map(({ id, trekker_id, device_id, heart_rate, spo2, altitude, temperature, captured_at, request_id }) => ({ id, trekker_id, device_id, heart_rate, spo2, altitude, temperature, captured_at, request_id })));
summarize("locations", locations);
summarize("symptom_reports", symptoms);
summarize("sos_events", sos);
summarize("sms_attempts", attempts.map((row) => ({ ...row, phone_number: maskPhone(row.phone_number) })));

console.info("\nThis audit is read-only. It does not update or delete hosted data.");
