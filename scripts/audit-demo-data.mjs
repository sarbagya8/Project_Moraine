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
    select("sensor_readings", "id, trekker_id, device_id, heart_rate, spo2, altitude, temperature, captured_at, request_id"),
    select("locations", "id, trekker_id, source, captured_at, request_id"),
    select("symptom_reports", "id, trekker_id, symptom, severity, created_at, request_id"),
    select("sos_events", "id, trekker_id, source, status, sms_status, created_at, request_id"),
    select("sms_attempts", "id, sos_event_id, phone_number, provider, status, created_at, request_id"),
  ]);

summarize("trekkers", trekkers);
summarize("devices", devices);
summarize("sensor_readings", readings.map(({ id, trekker_id, device_id, heart_rate, spo2, altitude, temperature, captured_at, request_id }) => ({ id, trekker_id, device_id, heart_rate, spo2, altitude, temperature, captured_at, request_id })));
summarize("locations", locations);
summarize("symptom_reports", symptoms);
summarize("sos_events", sos);
summarize("sms_attempts", attempts.map((row) => ({ ...row, phone_number: maskPhone(row.phone_number) })));

console.info("\nThis audit is read-only. It does not update or delete hosted data.");
