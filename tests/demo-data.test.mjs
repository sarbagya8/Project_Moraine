import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildDemoData,
  DEMO_IDS,
  DEMO_PAIRING_CODE,
} from "../scripts/demo-data.mjs";

const sessionSecret = "test-session-secret-that-is-longer-than-32-characters";
const now = new Date("2026-07-30T12:00:00.000Z");

test("demo dataset uses stable IDs and realistic current telemetry", () => {
  const first = buildDemoData({ now, sessionSecret });
  const second = buildDemoData({ now, sessionSecret });

  assert.deepEqual(first, second);
  assert.equal(first.trekker.id, "TRK-DEMO-001");
  assert.equal(first.trekker.name, "Sarbagya Acharya");
  assert.equal(first.device.id, "ARGUS-ESP32-DEMO-01");
  assert.notEqual(first.device.pairing_code_hash, DEMO_PAIRING_CODE);
  assert.equal(first.readings.at(-1).heart_rate, 88);
  assert.equal(first.readings.at(-1).spo2, 97);
  assert.equal(first.locations.at(-1).altitude, 2950);
  assert.equal(first.symptom.symptom, "headache");
  assert.equal(first.resolvedSos.status, "resolved");
  assert.equal(first.resolvedAttempt.status, "simulated");
  assert.equal(first.activeSos, undefined);
});

test("active SOS demo is explicit and remains simulated", () => {
  const data = buildDemoData({
    now,
    sessionSecret,
    activeSos: true,
  });

  assert.equal(data.activeSos.id, DEMO_IDS.activeSos);
  assert.equal(data.activeSos.status, "new");
  assert.equal(data.activeAttempt.status, "simulated");
  assert.equal(data.activeAttempt.provider, "demo");
});

test("seed command is idempotent and never invokes notification APIs", () => {
  const script = readFileSync(
    new URL("../scripts/seed-demo-data.mjs", import.meta.url),
    "utf8",
  );

  assert.match(script, /\.upsert\(/);
  assert.match(script, /onConflict: "id"/);
  assert.match(script, /--active-sos/);
  assert.match(script, /--reset/);
  assert.doesNotMatch(script, /graph\.facebook\.com|sendWhatsApp|\/api\/sos/);
});
