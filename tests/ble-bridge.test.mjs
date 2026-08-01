import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  bridgeLocationSchema,
  bridgeReadingSchema,
  bridgeSosSchema,
} = jiti("../src/lib/validation/ble-bridge-schema.ts");
const {
  detectBleEnvironment,
  parseBleIdentity,
  parseBleReading,
  parseBleSos,
  prioritizeBridgeQueue,
} = jiti("../src/lib/trekker-ble.ts");

const now = new Date().toISOString();

test("BLE bridge validation accepts phone GPS and optional sensor altitude", () => {
  assert.equal(
    bridgeReadingSchema.safeParse({
      trekkerId: "TRK-DEMO-001",
      deviceId: "ARGUS-ESP32-DEMO-01",
      heartRate: 82,
      spo2: 96,
      temperature: 36.7,
      capturedAt: now,
    }).success,
    true,
  );
  assert.equal(
    bridgeLocationSchema.safeParse({
      trekkerId: "TRK-DEMO-001",
      deviceId: "ARGUS-ESP32-DEMO-01",
      latitude: 28.45,
      longitude: 83.95,
      accuracyMeters: 12,
      capturedAt: now,
    }).success,
    true,
  );
});

test("physical BLE SOS requires a stable event ID", () => {
  const valid = {
    eventId: "ARGUS-ESP32-DEMO-01-sos-abc12345-1000",
    trekkerId: "TRK-DEMO-001",
    deviceId: "ARGUS-ESP32-DEMO-01",
    location: {
      latitude: 28.45,
      longitude: 83.95,
      accuracyMeters: 10,
      capturedAt: now,
    },
  };
  assert.equal(bridgeSosSchema.safeParse(valid).success, true);
  assert.equal(bridgeSosSchema.safeParse({ ...valid, eventId: "bad key" }).success, false);
});

test("BLE environment distinguishes unsupported browser and insecure context", () => {
  assert.equal(detectBleEnvironment(false, true), "unsupported_browser");
  assert.equal(detectBleEnvironment(true, false), "insecure_context");
  assert.equal(detectBleEnvironment(true, true), "ready");
});

test("BLE identity rejects missing and malformed device values", () => {
  assert.deepEqual(parseBleIdentity({ deviceId: "ARGUS-01", trekkerId: "TRK-01", firmwareVersion: "2.0.0" }), {
    deviceId: "ARGUS-01",
    trekkerId: "TRK-01",
    firmwareVersion: "2.0.0",
  });
  assert.equal(parseBleIdentity({ deviceId: "ARGUS-01", trekkerId: "TRK-01" }), null);
  assert.equal(parseBleIdentity({ deviceId: "", trekkerId: "TRK-01", firmwareVersion: "2.0.0" }), null);
});

test("MAX30102 valid, no-finger, weak-signal, and invalid payloads stay distinct", () => {
  const base = { deviceId: "ARGUS-01", trekkerId: "TRK-01", capturedAt: now, temperature: null };
  assert.equal(parseBleReading({ ...base, heartRate: 82, spo2: 97, sensorState: "valid" })?.heartRate, 82);
  assert.equal(parseBleReading({ ...base, heartRate: null, spo2: null, sensorState: "no_finger" })?.sensorState, "no_finger");
  assert.equal(parseBleReading({ ...base, heartRate: null, spo2: null, sensorState: "weak_signal" })?.sensorState, "weak_signal");
  assert.equal(parseBleReading({ ...base, heartRate: 88, spo2: 97, sensorState: "no_finger" }), null);
  assert.equal(parseBleReading({ ...base, heartRate: 500, spo2: 97, sensorState: "valid" }), null);
});

test("physical SOS BLE parser enforces source and event identity", () => {
  const valid = { eventId: "ARGUS-01-sos-abc123", deviceId: "ARGUS-01", trekkerId: "TRK-01", pressedAt: now, source: "physical_button" };
  assert.equal(parseBleSos(valid)?.eventId, valid.eventId);
  assert.equal(parseBleSos({ ...valid, source: "web_button" }), null);
  assert.equal(parseBleSos({ ...valid, eventId: "bad event" }), null);
});

test("offline bridge queue always prioritizes SOS", () => {
  const queued = prioritizeBridgeQueue([
    { id: "reading-1", kind: "reading", createdAt: "2026-01-01T00:00:00Z" },
    { id: "sos-1", kind: "sos", createdAt: "2026-01-01T00:00:02Z" },
    { id: "location-1", kind: "location", createdAt: "2026-01-01T00:00:01Z" },
  ]);
  assert.equal(queued[0].kind, "sos");
});

test("firmware is BLE-only and contains no network or GPS secrets", () => {
  const firmware = readFileSync(
    new URL("../esp32/argus_device.ino", import.meta.url),
    "utf8",
  );
  assert.match(firmware, /NimBLEDevice/);
  assert.match(firmware, /MAX30105/);
  assert.match(firmware, /maxim_heart_rate_and_oxygen_saturation/);
  assert.match(firmware, /no_finger/);
  assert.match(firmware, /weak_signal/);
  assert.match(firmware, /eventId/);
  assert.doesNotMatch(firmware, /WiFi|HTTPClient|TinyGPS|DEVICE_API_KEY|SSID|PASSWORD/);
  assert.doesNotMatch(firmware, /heartRate\s*=\s*8[028]|spo2\s*=\s*9[67]/);
});

test("bridge routes authenticate device ownership server-side", () => {
  const service = readFileSync(
    new URL("../src/lib/trekker-device-bridge.ts", import.meta.url),
    "utf8",
  );
  assert.match(service, /session\.subject !== expectedTrekkerId/);
  assert.match(service, /\.eq\("trekker_id", expectedTrekkerId\)/);
  assert.match(service, /\.eq\("is_active", true\)/);
});

test("BLE verification route is server-side and exposes only a minimal result", () => {
  const route = readFileSync(new URL("../src/app/api/trekker/device/verify/route.ts", import.meta.url), "utf8");
  assert.match(route, /bridgeDeviceIsAuthorized/);
  assert.match(route, /verified: true/);
  assert.doesNotMatch(route, /service.role|pairing_code_hash|SUPABASE_SERVICE_ROLE_KEY/);
});

test("bridge removes BLE and online listeners during disconnect cleanup", () => {
  const bridge = readFileSync(new URL("../src/lib/trekker-ble.ts", import.meta.url), "utf8");
  assert.match(bridge, /removeEventListener\("characteristicvaluechanged"/);
  assert.match(bridge, /removeEventListener\("online"/);
  assert.match(bridge, /Reconnect/);
  assert.match(bridge, /permission_denied/);
  assert.match(bridge, /SOS saved locally, waiting for internet/);
});

test("trekker dashboard distinguishes live BLE, stale storage, reconnect, and GPS denial", () => {
  const panel = readFileSync(new URL("../src/components/trekker/device-connection-panel.tsx", import.meta.url), "utf8");
  const portal = readFileSync(new URL("../src/components/trekker/trekker-portal.tsx", import.meta.url), "utf8");
  assert.match(panel, /Live from MAX30102/);
  assert.match(panel, /Reconnect/);
  assert.match(portal, /readingStale/);
  assert.match(portal, /Location permission was denied or no GPS fix was available/);
});
