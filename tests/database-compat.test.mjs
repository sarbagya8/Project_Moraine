import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { databaseErrorFields, isHardwareMigrationError } = jiti(
  "../src/lib/database-error.ts",
);

test("hardware migration errors are identified without swallowing unrelated schema errors", () => {
  assert.equal(
    isHardwareMigrationError({
      code: "42703",
      message: "column devices.firmware_version does not exist",
    }),
    true,
  );
  assert.equal(
    isHardwareMigrationError({
      code: "PGRST204",
      message: "Could not find the 'sensor_state' column",
    }),
    true,
  );
  assert.equal(
    isHardwareMigrationError({
      code: "PGRST204",
      message: "Could not find the 'pressure' column of 'sensor_readings'",
    }),
    true,
  );
  assert.equal(
    isHardwareMigrationError({
      code: "42703",
      message: "column trekkers.unrelated_column does not exist",
    }),
    false,
  );
  assert.equal(
    isHardwareMigrationError({ code: "42501", message: "permission denied" }),
    false,
  );
});

test("structured database diagnostics retain safe PostgREST fields", () => {
  assert.deepEqual(
    databaseErrorFields({
      code: "42703",
      message: "column does not exist",
      details: "query detail",
      hint: "apply migration",
    }),
    {
      databaseCode: "42703",
      databaseMessage: "column does not exist",
      databaseDetails: "query detail",
      databaseHint: "apply migration",
    },
  );
});

test("dashboard loaders tolerate optional hardware columns without inventing sensor state", () => {
  const authority = readFileSync(
    new URL("../src/app/api/authority/overview/route.ts", import.meta.url),
    "utf8",
  );
  const trekker = readFileSync(
    new URL("../src/app/api/trekker/me/route.ts", import.meta.url),
    "utf8",
  );
  for (const source of [authority, trekker]) {
    assert.match(source, /withHardwareSchemaFallback/);
    assert.match(source, /argus-demo-reading-%/);
    assert.match(source, /sensor_state: null/);
    assert.doesNotMatch(source, /sensor_state: ["']valid["']/);
  }
});

test("schema detector does not mislabel network, RLS, or unrelated-column errors", () => {
  for (const error of [
    { code: "42501", message: "permission denied for table sensor_readings" },
    { code: "PGRST301", message: "JWT expired" },
    { code: "FETCH_ERROR", message: "network unavailable" },
    { code: "42703", message: "column trekkers.unrelated_column does not exist" },
  ]) assert.equal(isHardwareMigrationError(error), false);
});

test("SOS compatibility preserves request-id idempotency while migration 010 is pending", () => {
  const service = readFileSync(
    new URL("../src/lib/sos-service.ts", import.meta.url),
    "utf8",
  );
  const migration = readFileSync(
    new URL("../supabase/migrations/003_idempotency_and_integrity.sql", import.meta.url),
    "utf8",
  );
  assert.match(service, /p_request_id: input\.requestId/);
  assert.match(migration, /sos_events_request_id_uidx/);
  assert.match(service, /if \(atomic\.duplicate\)/);
});

test("database readiness command reports exact operations without printing credentials", () => {
  const checker = readFileSync(
    new URL("../scripts/check-database-schema.mjs", import.meta.url),
    "utf8",
  );
  assert.match(checker, /ARGUS device firmware/);
  assert.match(checker, /sensor state/);
  assert.match(checker, /physical SOS state/);
  assert.match(checker, /physical SOS identity/);
  assert.doesNotMatch(checker, /console\.(?:info|error)\([^\n]*serviceRoleKey/);
});

test("final telemetry migration is non-destructive and includes every ESP32 field", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/015_final_realtime_telemetry_contract.sql", import.meta.url),
    "utf8",
  );
  for (const column of [
    "sensor_state", "pressure", "start_altitude", "current_altitude",
    "average_speed", "distance", "ams_status", "fall_detected", "fall_type",
    "sos_countdown", "sos_active", "device_id", "captured_at",
  ]) assert.match(migration, new RegExp(`\\b${column}\\b`));
  assert.doesNotMatch(migration, /\b(?:delete\s+from|truncate\s+table|drop\s+table)\b/i);
  assert.match(migration, /heart_rate drop not null/);
  assert.match(migration, /spo2 drop not null/);
});

test("cleanup SQL preserves the physical assignment and targets stable seed markers", () => {
  const preview = readFileSync(new URL("../supabase/cleanup/preview_demo_test_rows.sql", import.meta.url), "utf8");
  const cleanup = readFileSync(new URL("../supabase/cleanup/cleanup_demo_test_rows.sql", import.meta.url), "utf8");
  assert.match(preview, /argus-demo-reading-%/);
  assert.match(cleanup, /begin;/i);
  assert.match(cleanup, /commit;/i);
  assert.match(cleanup, /ARGUS-ESP32-DEMO-01/);
  assert.doesNotMatch(cleanup, /delete from public\.devices where id = 'ARGUS-ESP32-DEMO-01'/i);
});

test("production-safe environment example disables demo mode", () => {
  const environment = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(environment, /^DEMO_MODE=false$/m);
});
