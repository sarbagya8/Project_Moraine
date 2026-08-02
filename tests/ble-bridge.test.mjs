import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  bridgeIdentitySchema,
  bridgeLocationSchema,
  bridgeReadingSchema,
  bridgeSosSchema,
} = jiti("../src/lib/validation/ble-bridge-schema.ts");
const {
  bleCharacteristicCapabilities,
  ArgusJsonPacketAssembler,
  bluetoothDiscoveryOptions,
  detectBleEnvironment,
  parseBleIdentity,
  parseArgusPacket,
  parseArgusTextPacket,
  parseBleReading,
  parseBleSos,
  esp32TelemetryPacketSchema,
  normalizeEsp32TelemetryPacket,
  telemetryBooleanTransition,
  gpsStatusForTimestamp,
  prioritizeBridgeQueue,
} = jiti("../src/lib/trekker-ble.ts");
const {
  ARGUS_BLE,
  ARGUS_CHARACTERISTIC_UUID,
  ARGUS_SENSOR_STATES,
  ARGUS_SERVICE_UUID,
} = jiti(
  "../src/lib/bluetooth/argus-ble-config.ts",
);

const now = new Date().toISOString();
const actualEsp32Packet = {
  hr: 88,
  spo2: 97,
  altitude: 2950.0,
  pressure: 701.2,
  temperature: 24.5,
  start_altitude: 2900.0,
  current_altitude: 2950.0,
  average_speed: 1.25,
  distance: 450.0,
  ams: "normal",
  fall: false,
  fall_type: "none",
  sos_countdown: false,
  sos: false,
};

test("BLE bridge validation accepts phone GPS and optional sensor altitude", () => {
  assert.equal(
    bridgeReadingSchema.safeParse({
      deviceId: "ARGUS-ESP32-DEMO-01",
      heartRate: 82,
      spo2: 96,
      temperature: 36.7,
      temperatureType: "ambient",
      sensorState: "valid",
      capturedAt: now,
    }).success,
    true,
  );
  assert.equal(
    bridgeLocationSchema.safeParse({
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
    source: "physical_button",
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

test("BLE discovery uses the service normally and all devices only for diagnosis", () => {
  assert.deepEqual(bluetoothDiscoveryOptions("service"), {
    filters: [{ services: [ARGUS_BLE.service] }],
    optionalServices: [ARGUS_BLE.service],
  });
  assert.deepEqual(bluetoothDiscoveryOptions("diagnostic_all_devices"), {
    acceptAllDevices: true,
    optionalServices: [ARGUS_BLE.service],
  });
});

test("BLE identity accepts optional firmware and rejects malformed device values", () => {
  assert.deepEqual(parseBleIdentity({ type: "device_info", deviceId: "ARGUS-01", trekkerId: "TRK-01", firmwareVersion: "2.0.0" }), {
    deviceId: "ARGUS-01",
    trekkerId: "TRK-01",
    firmwareVersion: "2.0.0",
    identitySource: "firmware",
  });
  assert.deepEqual(parseBleIdentity({ type: "device_info", deviceId: "ARGUS-01", trekkerId: "TRK-01" }), {
    deviceId: "ARGUS-01",
    trekkerId: "TRK-01",
    firmwareVersion: null,
    identitySource: "firmware",
  });
  assert.equal(parseBleIdentity({ type: "device_info", deviceId: "", trekkerId: "TRK-01", firmwareVersion: "2.0.0" }), null);
  assert.equal(parseBleIdentity({ type: "sensor", deviceId: "ARGUS-01", firmwareVersion: "2.0.0" }), null);
  assert.equal(bridgeIdentitySchema.safeParse({
    deviceId: "ARGUS-01",
    trekkerId: null,
    firmwareVersion: "2.0.0",
    deviceName: "ARGUS-1234",
    identitySource: "firmware",
  }).success, true);
  assert.equal(bridgeIdentitySchema.safeParse({
    deviceId: "ARGUS-01",
    trekkerId: null,
    firmwareVersion: null,
    deviceName: "OTHER-1234",
    identitySource: "assigned_device",
  }).success, true);
  assert.equal(bridgeIdentitySchema.safeParse({
    deviceId: "ARGUS-01",
    identitySource: "assigned_device",
  }).success, true);
});

test("BLE characteristic properties make READ optional and NOTIFY mandatory", () => {
  assert.deepEqual(
    bleCharacteristicCapabilities({ read: true, notify: true }),
    { canRead: true, canNotify: true },
  );
  assert.deepEqual(
    bleCharacteristicCapabilities({ read: false, notify: true }),
    { canRead: false, canNotify: true },
  );
  assert.deepEqual(
    bleCharacteristicCapabilities({ read: true, indicate: true }),
    { canRead: true, canNotify: false },
  );
});

test("MAX30102 valid, no-finger, weak-signal, and invalid payloads stay distinct", () => {
  const base = { deviceId: "ARGUS-01", trekkerId: "TRK-01", capturedAt: now, temperature: null };
  assert.equal(parseBleReading({ ...base, heartRate: 82, spo2: 97, sensorState: "valid" })?.heartRate, 82);
  assert.equal(parseBleReading({ ...base, heartRate: null, spo2: null, sensorState: "no_finger" })?.sensorState, "no_finger");
  assert.equal(parseBleReading({ ...base, heartRate: null, spo2: null, sensorState: "weak_signal" })?.sensorState, "weak_signal");
  assert.equal(parseBleReading({ ...base, heartRate: null, spo2: null, sensorState: "sensor_unavailable" })?.sensorState, "sensor_unavailable");
  assert.equal(parseBleReading({ ...base, heartRate: 88, spo2: 97, sensorState: "no_finger" }), null);
  assert.equal(parseBleReading({ ...base, heartRate: 500, spo2: 97, sensorState: "valid" }), null);
});

test("physical SOS BLE parser enforces source and event identity", () => {
  const valid = { eventId: "ARGUS-01-sos-abc123", deviceId: "ARGUS-01", trekkerId: "TRK-01", pressedAt: now, source: "physical_button" };
  assert.equal(parseBleSos(valid)?.eventId, valid.eventId);
  assert.equal(parseBleSos({ ...valid, source: "web_button" }), null);
  assert.equal(parseBleSos({ ...valid, eventId: "bad event" }), null);
});

test("single confirmed characteristic dispatches existing JSON sensor and SOS packets", () => {
  const sensor = parseArgusPacket({
    type: "sensor",
    heartRate: 78,
    spo2: 97,
    temperature: null,
    temperatureType: null,
    altitude: null,
    capturedAt: 1234,
    sensorState: "valid",
  }, "ARGUS-01");
  assert.equal(sensor?.type, "sensor");
  assert.equal(sensor?.reading.heartRate, 78);

  const sos = parseArgusPacket({
    type: "sos",
    eventId: "ARGUS-01-ABCDEF01-1",
    trekkerId: null,
    pressedAt: 4321,
    source: "physical_button",
  }, "ARGUS-01");
  assert.equal(sos?.type, "sos");
  assert.equal(sos?.sos.eventId, "ARGUS-01-ABCDEF01-1");
  assert.equal(parseArgusPacket({ value: "unknown" }, "ARGUS-01"), null);
});

test("compact INFO, DATA, SOS, and deployed CSV packets parse without identity or timestamps", () => {
  assert.deepEqual(parseArgusTextPacket("INFO|ARGUS-01|2.0.0"), {
    type: "device_info",
    deviceId: "ARGUS-01",
    firmwareVersion: "2.0.0",
  });
  const data = parseArgusTextPacket("DATA|88|97|valid");
  const reading = parseArgusPacket(data, "ARGUS-01");
  assert.equal(reading?.type, "sensor");
  assert.equal(reading?.reading.heartRate, 88);
  assert.equal(reading?.reading.spo2, 97);
  assert.equal(reading?.reading.deviceId, "ARGUS-01");

  const unavailable = parseArgusPacket(
    parseArgusTextPacket("DATA|null|null|no_finger"),
    "ARGUS-01",
  );
  assert.equal(unavailable?.type, "sensor");
  assert.equal(unavailable?.reading.heartRate, null);

  const sos = parseArgusPacket(
    parseArgusTextPacket("SOS|ABCD123456780001"),
    "ARGUS-01",
  );
  assert.equal(sos?.type, "sos");
  assert.equal(sos?.sos.eventId, "ABCD123456780001");

  assert.equal(
    parseArgusPacket(parseArgusTextPacket("88,97,valid"), "ARGUS-01")?.type,
    "sensor",
  );
  assert.equal(parseArgusTextPacket("DATA|bad|97|valid"), null);
  assert.equal(parseArgusTextPacket("not-an-argus-packet"), null);
});

test("actual TrekProof ESP32 JSON validates and normalizes all live telemetry", () => {
  assert.equal(esp32TelemetryPacketSchema.safeParse(actualEsp32Packet).success, true);
  const reading = normalizeEsp32TelemetryPacket(
    { ...actualEsp32Packet, extra_firmware_field: "ignored safely" },
    "ARGUS-01",
    new Date("2026-01-01T00:00:00.000Z"),
  );
  assert.equal(reading?.heartRate, 88);
  assert.equal(reading?.spo2, 97);
  assert.equal(reading?.altitude, 2950);
  assert.equal(reading?.pressure, 701.2);
  assert.equal(reading?.temperatureType, "ambient");
  assert.equal(reading?.averageSpeed, 1.25);
  assert.equal(reading?.distance, 450);
  assert.equal(reading?.amsStatus, "normal");
  assert.equal(reading?.fallDetected, false);
  assert.equal(reading?.sosActive, false);
  assert.equal(reading?.sensorState, "valid");
});

test("actual telemetry derives no-finger and invalid states without displaying zero", () => {
  const noFinger = normalizeEsp32TelemetryPacket(
    { ...actualEsp32Packet, hr: 0, spo2: 0 },
    "ARGUS-01",
  );
  assert.equal(noFinger?.sensorState, "no_finger");
  assert.equal(noFinger?.heartRate, null);
  assert.equal(noFinger?.spo2, null);
  const invalid = normalizeEsp32TelemetryPacket(
    { ...actualEsp32Packet, hr: 500, spo2: 45 },
    "ARGUS-01",
  );
  assert.equal(invalid?.sensorState, "invalid");
  assert.equal(invalid?.heartRate, null);
  assert.equal(normalizeEsp32TelemetryPacket({ ...actualEsp32Packet, hr: "bad" }, "ARGUS-01"), null);
});

test("BLE JSON assembler cleans terminators and reassembles multiple chunks", () => {
  const complete = new ArgusJsonPacketAssembler();
  const terminated = complete.push(`${JSON.stringify(actualEsp32Packet)}\0\0\r\n`);
  assert.equal(terminated.packets.length, 1);
  assert.equal(terminated.buffered, false);

  const fragmented = new ArgusJsonPacketAssembler();
  const json = JSON.stringify(actualEsp32Packet);
  const splitAt = Math.floor(json.length / 2);
  const first = fragmented.push(json.slice(0, splitAt));
  assert.equal(first.buffered, true);
  assert.equal(first.packets.length, 0);
  const second = fragmented.push(json.slice(splitAt));
  assert.equal(second.buffered, false);
  assert.equal(second.packets.length, 1);
  assert.equal(second.packets[0].hr, 88);

  const malformed = new ArgusJsonPacketAssembler().push('{"hr":88,}');
  assert.equal(malformed.packets.length, 0);
  assert.match(malformed.parseError, /JSON|property|position|Expected/i);
});

test("telemetry SOS and fall handling triggers only on boolean edges", () => {
  assert.deepEqual(telemetryBooleanTransition(false, true), {
    activated: true,
    reset: false,
  });
  assert.deepEqual(telemetryBooleanTransition(true, true), {
    activated: false,
    reset: false,
  });
  assert.deepEqual(telemetryBooleanTransition(true, false), {
    activated: false,
    reset: true,
  });
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
  const firmware = [
    "TrekProof_ARGUS.ino",
    "BLEDriver.cpp",
    "MAX30102Driver.cpp",
    "Config.h",
  ].map((file) => readFileSync(
    new URL(`../esp32/TrekProof_ARGUS/${file}`, import.meta.url),
    "utf8",
  )).join("\n");
  assert.match(firmware, /BLEDevice/);
  assert.match(firmware, /MAX30105/);
  assert.match(firmware, /maxim_heart_rate_and_oxygen_saturation/);
  assert.match(firmware, /no_finger/);
  assert.match(firmware, /weak_signal/);
  assert.match(firmware, /sensor_unavailable/);
  assert.match(firmware, /sos_active/);
  assert.match(firmware, /sos_countdown/);
  assert.doesNotMatch(firmware, /WiFi|HTTPClient|TinyGPS|DEVICE_API_KEY|SSID|PASSWORD/);
  assert.doesNotMatch(firmware, /heartRate\s*=\s*8[028]|spo2\s*=\s*9[67]/);
  assert.doesNotMatch(firmware, /ir18\s*%|red18\s*%/);
  assert.match(firmware, /I2C_SDA 8/);
  assert.match(firmware, /I2C_SCL 9/);
  assert.match(firmware, /BUTTON_PIN 3/);
  assert.match(firmware, /advertising->addServiceUUID\(ARGUS_SERVICE_UUID\)/);
});

test("firmware and browser share the exact ARGUS BLE contract", () => {
  const header = readFileSync(
    new URL("../esp32/TrekProof_ARGUS/argus_ble_config.h", import.meta.url),
    "utf8",
  );
  assert.equal(ARGUS_SERVICE_UUID, "4fafc201-1fb5-459e-8fcc-c5c9c331914b");
  assert.equal(ARGUS_CHARACTERISTIC_UUID, "beb5483e-36e1-4688-b7f5-ea07361b26a8");
  for (const uuid of [ARGUS_BLE.service, ARGUS_BLE.characteristic]) {
    assert.match(header, new RegExp(uuid));
  }
  const driver = readFileSync(
    new URL("../esp32/TrekProof_ARGUS/BLEDriver.cpp", import.meta.url),
    "utf8",
  );
  assert.match(driver, /ARGUS_CHARACTERISTIC_UUID/);
  assert.match(driver, /PROPERTY_READ \| BLECharacteristic::PROPERTY_NOTIFY/);
  assert.doesNotMatch(driver, /PROPERTY_WRITE/);
  assert.match(driver, /void onRead\(BLECharacteristic\* characteristic\)/);
  assert.match(driver, /setDeviceInfoValue\(characteristic, true\)/);
  assert.match(driver, /"INFO\|%s\|%s"/);
  assert.match(driver, /\\"hr\\":%d/);
  assert.match(driver, /\\"spo2\\":%d/);
  assert.match(driver, /\\"sos_countdown\\":%s/);
  assert.match(driver, /\\"sos\\":%s/);
  assert.match(driver, /notifyJsonChunks\(jsonBuffer, length\)/);
  assert.match(driver, /BLE_NOTIFICATION_CHUNK_SIZE/);
  assert.deepEqual(ARGUS_SENSOR_STATES, [
    "valid",
    "no_finger",
    "weak_signal",
    "invalid",
    "sensor_unavailable",
    "sensor_error",
  ]);
});

test("BLE callbacks drive OLED connection state and restart advertising", () => {
  const driver = readFileSync(
    new URL("../esp32/TrekProof_ARGUS/BLEDriver.cpp", import.meta.url),
    "utf8",
  );
  const oled = readFileSync(
    new URL("../esp32/TrekProof_ARGUS/OLEDDriver.cpp", import.meta.url),
    "utf8",
  );
  assert.match(driver, /void onConnect\(BLEServer\*\) override/);
  assert.match(driver, /void onDisconnect\(BLEServer\*\) override/);
  assert.match(driver, /g_sensorData\.ble_connected = true/);
  assert.match(driver, /g_sensorData\.ble_connected = false/);
  assert.match(driver, /BLEDevice::startAdvertising\(\)/);
  assert.match(driver, /forceOLEDRedraw\(\)/);
  assert.match(driver, /BLE: advertising started/);
  assert.match(driver, /BLE: browser connected/);
  assert.match(driver, /BLE: browser disconnected/);
  assert.match(oled, /Advertising\.\.\./);
  assert.match(oled, /g_sensorData\.ble_connected/);
  assert.match(oled, /display\.print\("\[OK\]"\)/);
});

test("bridge routes authenticate device ownership server-side", () => {
  const service = readFileSync(
    new URL("../src/lib/trekker-device-bridge.ts", import.meta.url),
    "utf8",
  );
  assert.match(service, /session\?\.role !== "trekker"/);
  assert.match(service, /\.eq\("trekker_id", session\.subject\)/);
  assert.match(service, /\.eq\("is_active", true\)/);
});

test("BLE verification route is server-side and exposes only a minimal result", () => {
  const route = readFileSync(new URL("../src/app/api/trekker/device/verify/route.ts", import.meta.url), "utf8");
  assert.match(route, /authorizedBridgeDevice/);
  assert.match(route, /verified: true/);
  assert.match(route, /if \(identity\.data\.firmwareVersion\)/);
  assert.match(route, /identitySource: identity\.data\.identitySource/);
  assert.doesNotMatch(route, /service.role|pairing_code_hash|SUPABASE_SERVICE_ROLE_KEY/);
});

test("bridge removes BLE and online listeners during disconnect cleanup", () => {
  const bridge = readFileSync(new URL("../src/lib/trekker-ble.ts", import.meta.url), "utf8");
  assert.match(bridge, /removeEventListener\(\s*"characteristicvaluechanged"/);
  assert.match(bridge, /removeEventListener\("online"/);
  assert.match(bridge, /stopNotifications/);
  assert.match(bridge, /acceptAllDevices: true/);
  assert.match(bridge, /filters: \[\{ services: \[ARGUS_BLE\.service\] \}\]/);
  assert.doesNotMatch(bridge, /namePrefix:/);
  assert.match(bridge, /continuingWithAssignedDevice: true/);
  assert.match(bridge, /identitySource: "assigned_device"/);
  assert.doesNotMatch(bridge, /valid device ID and firmware version/);
  assert.match(bridge, /Automatic reconnect failed/);
  assert.match(bridge, /permission_denied/);
  assert.match(bridge, /Physical SOS saved safely/);
});

test("physical SOS metadata cannot overwrite a different active hardware event", () => {
  const route = readFileSync(
    new URL("../src/app/api/trekker/device/sos/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /\.eq\("hardware_event_id", input\.data\.eventId\)/);
  assert.match(route, /input\.data\.reading\.deviceId !== owner\.deviceId/);
});

test("trekker dashboard distinguishes live BLE, stale storage, reconnect, and GPS denial", () => {
  const bridge = readFileSync(new URL("../src/lib/trekker-ble.ts", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../src/components/trekker/device-connection-panel.tsx", import.meta.url), "utf8");
  const portal = readFileSync(new URL("../src/components/trekker/trekker-portal.tsx", import.meta.url), "utf8");
  assert.match(bridge, /Live MAX30102 data received/);
  assert.match(panel, /Reconnect/);
  assert.match(panel, /connectInFlight\.current/);
  assert.match(portal, /readingStale/);
  assert.match(portal, /Location permission was denied or no GPS fix was available/);
});

test("GPS freshness distinguishes missing, available, and stale fixes", () => {
  const now = Date.parse("2026-08-01T12:00:00Z");
  assert.equal(gpsStatusForTimestamp(null, 120_000, now), "unavailable");
  assert.equal(
    gpsStatusForTimestamp("2026-08-01T11:59:30Z", 120_000, now),
    "available",
  );
  assert.equal(
    gpsStatusForTimestamp("2026-08-01T11:55:00Z", 120_000, now),
    "stale",
  );
});

test("physical SOS accepts explicitly unavailable GPS", () => {
  assert.equal(bridgeSosSchema.safeParse({
    eventId: "ARGUS-01-ABCDEF01-1",
    deviceId: "ARGUS-01",
    pressedAt: now,
    source: "physical_button",
    location: null,
  }).success, true);
});

test("hardware SOS migration enforces event and notification idempotency", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/010_argus_hardware_integration.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /sos_events_hardware_event_id_uidx/);
  assert.match(migration, /sms_attempts_request_recipient_uidx/);
  assert.match(migration, /sensor_readings_state_values_check/);
  const reconciliation = readFileSync(
    new URL("../supabase/migrations/013_hardware_contract_reconciliation.sql", import.meta.url),
    "utf8",
  );
  assert.match(reconciliation, /sensor_unavailable/);
  assert.match(reconciliation, /sensor_readings_device_id_fkey/);
  assert.match(reconciliation, /locations_device_id_fkey/);
  assert.match(reconciliation, /sos_events_device_id_fkey/);
});

test("TrekProof telemetry migration preserves RLS and adds only packet fields", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/014_esp32_telemetry_payload.sql", import.meta.url),
    "utf8",
  );
  for (const column of [
    "pressure",
    "start_altitude",
    "current_altitude",
    "average_speed",
    "distance",
    "ams_status",
    "fall_detected",
    "fall_type",
    "sos_countdown",
    "sos_active",
  ]) {
    assert.match(migration, new RegExp(`add column if not exists ${column}`));
  }
  assert.doesNotMatch(migration, /disable row level security|drop table|truncate/i);
});

test("SOS persistence occurs before the WhatsApp provider call", () => {
  const service = readFileSync(
    new URL("../src/lib/sos-service.ts", import.meta.url),
    "utf8",
  );
  const snapshot = service.indexOf('operation: "store SOS snapshot"');
  const providerCall = service.indexOf("sendWhatsAppSosAlert(phoneNumber");
  assert.ok(snapshot >= 0);
  assert.ok(providerCall > snapshot);
  assert.match(service, /if \(atomic\.duplicate\)/);
  assert.match(service, /notificationAttemptId/);
  assert.match(service, /notificationStatus = "failed"/);
});
