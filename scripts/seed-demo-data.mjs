import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import {
  buildDemoData,
  DEMO_IDS,
  DEMO_PAIRING_CODE,
} from "./demo-data.mjs";

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

const activeSos = process.argv.includes("--active-sos");
const reset = process.argv.includes("--reset");
const production =
  process.env.NODE_ENV === "production" ||
  process.env.VERCEL_ENV === "production";

if (production) {
  throw new Error("Demo data cannot be seeded in a production environment.");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const sessionSecret = process.env.SESSION_SECRET?.trim();
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
  );
}

const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function assertSuccess(label, operation) {
  const { error } = await operation;
  if (!error) return;
  if (error.code === "PGRST205" || error.code === "42P01") {
    throw new Error(
      `${label}: ARGUS tables are missing. Apply supabase/migrations/001_initial_schema.sql through 008_optional_sensor_altitude.sql in order, then run this command again.`,
    );
  }
  throw new Error(`${label}: ${error.code || "database error"} ${error.message}`);
}

async function removeDemoData() {
  await assertSuccess(
    "Remove notification attempts",
    db
      .from("sms_attempts")
      .delete()
      .in("id", [DEMO_IDS.resolvedAttempt, DEMO_IDS.activeAttempt]),
  );
  await assertSuccess(
    "Remove SOS events",
    db
      .from("sos_events")
      .delete()
      .in("id", [DEMO_IDS.resolvedSos, DEMO_IDS.activeSos]),
  );
  await assertSuccess(
    "Remove readings",
    db.from("sensor_readings").delete().eq("trekker_id", DEMO_IDS.trekker),
  );
  await assertSuccess(
    "Remove locations",
    db.from("locations").delete().eq("trekker_id", DEMO_IDS.trekker),
  );
  await assertSuccess(
    "Remove symptoms",
    db.from("symptom_reports").delete().eq("trekker_id", DEMO_IDS.trekker),
  );
  await assertSuccess(
    "Remove device",
    db.from("devices").delete().eq("id", DEMO_IDS.device),
  );
  await assertSuccess(
    "Remove trekker",
    db.from("trekkers").delete().eq("id", DEMO_IDS.trekker),
  );
}

async function seedDemoData() {
  if (reset) {
    await removeDemoData();
    console.info("ARGUS demo data removed.");
    return;
  }

  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }

  const rows = buildDemoData({
    sessionSecret,
    activeSos,
    appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  });

  await assertSuccess(
    "Check ARGUS schema",
    db.from("trekkers").select("id").limit(1),
  );
  await assertSuccess(
    "Upsert demo trekker",
    db.from("trekkers").upsert(rows.trekker, { onConflict: "id" }),
  );
  await assertSuccess(
    "Upsert demo device",
    db.from("devices").upsert(rows.device, { onConflict: "id" }),
  );
  await assertSuccess(
    "Upsert demo readings",
    db.from("sensor_readings").upsert(rows.readings, { onConflict: "id" }),
  );
  await assertSuccess(
    "Upsert demo locations",
    db.from("locations").upsert(rows.locations, { onConflict: "id" }),
  );
  await assertSuccess(
    "Upsert demo symptom",
    db.from("symptom_reports").upsert(rows.symptom, { onConflict: "id" }),
  );
  await assertSuccess(
    "Upsert resolved SOS",
    db.from("sos_events").upsert(rows.resolvedSos, { onConflict: "id" }),
  );
  await assertSuccess(
    "Upsert resolved notification",
    db.from("sms_attempts").upsert(rows.resolvedAttempt, { onConflict: "id" }),
  );

  if (activeSos) {
    await assertSuccess(
      "Upsert active SOS",
      db.from("sos_events").upsert(rows.activeSos, { onConflict: "id" }),
    );
    await assertSuccess(
      "Upsert active notification",
      db.from("sms_attempts").upsert(rows.activeAttempt, { onConflict: "id" }),
    );
  } else {
    await assertSuccess(
      "Remove optional active notification",
      db.from("sms_attempts").delete().eq("id", DEMO_IDS.activeAttempt),
    );
    await assertSuccess(
      "Remove optional active SOS",
      db.from("sos_events").delete().eq("id", DEMO_IDS.activeSos),
    );
  }

  console.info("ARGUS demo data is ready.");
  console.info(`Trekker ID: ${DEMO_IDS.trekker}`);
  console.info(`Device ID: ${DEMO_IDS.device}`);
  console.info(`Pairing code: ${DEMO_PAIRING_CODE}`);
  console.info(
    activeSos
      ? "An active simulated SOS was included."
      : "Only the resolved SOS history was included.",
  );
  console.info("No WhatsApp request was made.");
}

try {
  await seedDemoData();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
