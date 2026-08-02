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
    ["ARGUS device firmware", "devices", "id, firmware_version"],
    ["MAX30102 sensor state", "sensor_readings", "id, sensor_state"],
    ["physical SOS identity", "sos_events", "id, device_id, hardware_event_id"],
    ["browser GPS device link", "locations", "id, device_id"],
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

  if (failed) {
    console.error(
      "ARGUS schema is incomplete. Apply all pending migrations through 013_hardware_contract_reconciliation.sql, then run npm run db:check again.",
    );
    process.exitCode = 1;
  } else {
    console.info("ARGUS database schema is ready.");
  }
}
