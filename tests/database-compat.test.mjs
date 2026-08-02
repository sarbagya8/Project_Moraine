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

test("both dashboard loaders use the shared hardware-schema fallback", () => {
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
    assert.match(source, /hardwareSchemaReady/);
  }
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
  assert.match(checker, /MAX30102 sensor state/);
  assert.match(checker, /physical SOS identity/);
  assert.doesNotMatch(checker, /console\.(?:info|error)\([^\n]*serviceRoleKey/);
});
