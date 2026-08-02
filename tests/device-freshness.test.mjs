import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { deviceFreshnessState } = jiti("../src/lib/device-freshness.ts");
const thresholds = { onlineSeconds: 120, offlineSeconds: 600 };
const now = Date.parse("2026-08-02T12:00:00.000Z");

test("device freshness distinguishes online, stale, offline, and never connected", () => {
  assert.equal(deviceFreshnessState(null, true, thresholds, now), "never_connected");
  assert.equal(deviceFreshnessState("2026-08-02T11:59:00.000Z", true, thresholds, now), "online");
  assert.equal(deviceFreshnessState("2026-08-02T11:55:00.000Z", true, thresholds, now), "stale");
  assert.equal(deviceFreshnessState("2026-08-02T11:40:00.000Z", true, thresholds, now), "offline");
  assert.equal(deviceFreshnessState("2026-08-02T11:59:00.000Z", false, thresholds, now), "offline");
});
