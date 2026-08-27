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
      ) {
        value = value.slice(1, -1);
      }
      if (!(name in process.env)) process.env[name] = value;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

await loadEnvironmentFile(".env.local");
await loadEnvironmentFile(".env");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !serviceRoleKey) {
  const missing = [
    !url ? "NEXT_PUBLIC_SUPABASE_URL" : null,
    !serviceRoleKey ? "SUPABASE_SERVICE_ROLE_KEY" : null,
  ].filter(Boolean);
  console.error(`Database configuration is missing: ${missing.join(", ")}`);
  process.exitCode = 1;
} else {
  const db = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const probes = [
    ["core trekker records", "trekkers", "id"],
    ["MORAINE device firmware", "devices", "id, firmware_version"],
    ["device verification timestamp", "devices", "id, last_verified_at"],
    ["sensor state", "sensor_readings", "id, sensor_state"],
    ["pressure", "sensor_readings", "id, pressure"],
    ["start altitude", "sensor_readings", "id, start_altitude"],
    ["current altitude", "sensor_readings", "id, current_altitude"],
    ["average speed", "sensor_readings", "id, average_speed"],
    ["distance", "sensor_readings", "id, distance"],
    ["AMS status", "sensor_readings", "id, ams_status"],
    ["fall state", "sensor_readings", "id, fall_detected"],
    ["fall type", "sensor_readings", "id, fall_type"],
    ["SOS countdown", "sensor_readings", "id, sos_countdown"],
    ["physical SOS state", "sensor_readings", "id, sos_active"],
    ["physical SOS identity", "sos_events", "id, device_id, hardware_event_id"],
    ["browser GPS device link", "locations", "id, device_id"],
    ["health profile", "trekkers", "id, date_of_birth, address, blood_group, allergies, known_conditions, current_medications, emergency_contact_name, emergency_contact_phone, emergency_notes"],
    ["Supabase Auth ownership", "trekkers", "id, auth_user_id, email, role"],
    ["optional profile details", "trekkers", "id, preferred_language, secondary_emergency_contact_name, secondary_emergency_contact_phone, emergency_contact_relationship"],
    ["device display identity", "devices", "id, display_name"],
  ];
  let failed = false;
  for (const [operation, table, columns] of probes) {
    const { error } = await db.from(table).select(columns).limit(1);
    if (!error) {
      console.info(`PASS ${operation} (${table})`);
      continue;
    }
    failed = true;
    console.error(
      `FAIL ${operation} (${table}): ${error.code || "unknown"} ${error.message}`,
    );
    if (error.details) console.error(`  details: ${error.details}`);
    if (error.hint) console.error(`  hint: ${error.hint}`);
  }

  const portalProbes = [
    ["portal devices", "devices", "id, trekker_id, is_active, last_seen_at, created_at, updated_at"],
    ["portal readings", "sensor_readings", "trekker_id, device_id, heart_rate, spo2, altitude, temperature, captured_at, request_id"],
    ["portal emergencies", "sos_events", "id, trekker_id, source, status, sms_status, severity_score, severity_label, severity_data_status, latitude, longitude, location_accuracy, location_captured_at, location_is_stale, heart_rate, spo2, altitude, temperature, reading_captured_at, reading_is_stale, symptom, symptom_severity, symptom_notes, map_url, rescue_url, created_at, resolved_at"],
    ["portal locations", "locations", "trekker_id, latitude, longitude, accuracy_meters, captured_at, source"],
    ["portal notifications", "sms_attempts", "id, sos_event_id, phone_number, provider, status, provider_reference, error_message, created_at"],
    ["portal symptoms", "symptom_reports", "trekker_id, symptom, severity, notes, created_at"],
  ];
  for (const [operation, table, columns] of portalProbes) {
    const { error } = await db.from(table).select(columns).limit(1);
    if (!error) {
      console.info(`PASS ${operation} (${table})`);
      continue;
    }
    failed = true;
    console.error(`FAIL ${operation} (${table}): ${error.code || "unknown"} ${error.message}`);
    if (error.details) console.error(`  details: ${error.details}`);
    if (error.hint) console.error(`  hint: ${error.hint}`);
  }

  if (failed) {
    console.error(
      "MORAINE schema is incomplete. Apply the missing numbered migrations through 017, then run npm run db:check again.",
    );
    process.exitCode = 1;
  } else {
    console.info("MORAINE database schema is ready.");
  }
}
