import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { routePositions, validCoordinate } = jiti(
  "../src/lib/rescue-data.ts",
);
const { idempotencyKey, suppliedIdempotencyKey } = jiti(
  "../src/lib/idempotency.ts",
);
const { ageSeconds, universalMapUrl } = jiti("../src/lib/map-links.ts");
const {
  aggregateNotificationStatus,
  cooldownRemainingSeconds,
} = jiti("../src/lib/notification.ts");
const { canonicalNepalMobile, maskPhone, normalizeNepalMobile } = jiti(
  "../src/lib/phone.ts",
);
const {
  buildSosMessage,
  calculateSeverity,
  locationStatus,
} = jiti("../src/lib/sos-rules.ts");
const { locationSchema } = jiti(
  "../src/lib/validation/location-schema.ts",
);
const { readingSchema } = jiti(
  "../src/lib/validation/reading-schema.ts",
);
const {
  updateSosStatusSchema,
} = jiti("../src/lib/validation/sos-schema.ts");
const {
  extractWhatsAppStatusEvents,
  normalizeWhatsAppRecipient,
  shouldApplyWhatsAppStatus,
  trustedWhatsAppRecipients,
  verifyWebhookSignature,
  whatsappConfigurationReady,
} = jiti("../src/lib/whatsapp-protocol.ts");
const { buildSosTemplatePayload } = jiti("../src/lib/whatsapp-protocol.ts");

const timestamp = new Date().toISOString();
const routeFixture = [
  {
    latitude: 28.44,
    longitude: 83.94,
    capturedAt: new Date(Date.now() - 60_000).toISOString(),
  },
  {
    latitude: 28.45,
    longitude: 83.95,
    capturedAt: new Date().toISOString(),
  },
];

test("sensor validation accepts valid values and rejects impossible values", () => {
  const valid = {
    trekkerId: "TRK001",
    deviceId: "ARGUS-DEVICE-01",
    heartRate: 82,
    spo2: 96,
    altitude: 2400,
    temperature: 18.5,
    temperatureType: "ambient",
    sensorState: "valid",
    capturedAt: timestamp,
  };
  assert.equal(readingSchema.safeParse(valid).success, true);
  assert.equal(
    readingSchema.safeParse({ ...valid, heartRate: 241 }).success,
    false,
  );
  assert.equal(readingSchema.safeParse({ ...valid, spo2: 49 }).success, false);
});

test("coordinate validation and map ordering are safe", () => {
  assert.equal(
    locationSchema.safeParse({
      trekkerId: "TRK001",
      latitude: 91,
      longitude: 85,
      accuracyMeters: 1,
      source: "device",
      capturedAt: timestamp,
    }).success,
    false,
  );
  assert.equal(validCoordinate(27.7172, 85.324), true);
  assert.deepEqual(routePositions(routeFixture)[0], [
    routeFixture[0].latitude,
    routeFixture[0].longitude,
  ]);
  assert.equal(
    universalMapUrl(27.7172, 85.324),
    "https://www.google.com/maps/search/?api=1&query=27.7172%2C85.324",
  );
});

test("Nepal numbers normalize and trusted WhatsApp recipients deduplicate", () => {
  assert.equal(normalizeNepalMobile("+977 9800000001"), "9800000001");
  assert.equal(canonicalNepalMobile("9800000001"), "+9779800000001");
  assert.equal(maskPhone("+9779800000001"), "***0001");
  assert.equal(normalizeWhatsAppRecipient("98 0000-0002"), "9779800000002");
  assert.deepEqual(
    trustedWhatsAppRecipients({
      emergency_contact: "+9779800000002",
      guide_mobile: "9800000002",
    }),
    ["9779800000002"],
  );
});

test("idempotency keys are validated and reused for duplicate requests", () => {
  const request = new Request("https://argus.test/api/readings", {
    headers: { "x-idempotency-key": "device-reading-0001" },
  });
  assert.equal(suppliedIdempotencyKey(request), "device-reading-0001");
  assert.equal(idempotencyKey(request, "fallback-id"), "device-reading-0001");
  const missing = new Request("https://argus.test/api/readings");
  assert.equal(suppliedIdempotencyKey(missing), null);
  assert.equal(idempotencyKey(missing, "fallback-id"), "fallback-id");
});

test("severity score is deterministic, bounded, and reports insufficient data", () => {
  const result = calculateSeverity({
    source: "physical_button",
    symptomSeverity: "severe",
    locationAvailable: false,
    locationIsStale: false,
    readingAvailable: true,
    readingIsStale: false,
    heartRate: 140,
    spo2: 87,
    temperature: 40,
  });
  assert.deepEqual(result, {
    severityScore: 95,
    severityLabel: "critical",
    dataStatus: "insufficient_data",
  });
});

test("stale-data helpers identify fresh, stale, unavailable, and invalid data", () => {
  assert.equal(locationStatus(false, false), "unavailable");
  assert.equal(locationStatus(true, false, timestamp), "fresh");
  assert.match(
    locationStatus(
      true,
      true,
      new Date(Date.now() - 300_000).toISOString(),
    ),
    /^stale/,
  );
  assert.equal(ageSeconds("not-a-date"), Number.MAX_SAFE_INTEGER);
});

test("SOS message contains the documented ARGUS fields and disclaimer", () => {
  const message = buildSosMessage({
    name: "Demo Trekker",
    trekkerId: "TRK001",
    severityLabel: "high",
    severityScore: 62,
    route: "Annapurna Base Camp",
    emergencyTime: timestamp,
    heartRate: "130 bpm",
    spo2: "91%",
    temperature: "38 C",
    altitude: "3200 m",
    symptom: "Dizziness",
    locationStatus: "fresh",
    trackingId: "event-id",
    mapUrl: "https://maps.test",
    rescueUrl: "https://argus.test/rescue/event-id",
  });
  assert.match(message, /^ARGUS SOS ALERT/);
  assert.match(message, /Severity: high \(62\/100\)/);
  assert.match(message, /not a medical diagnosis/);
});

test("notification aggregation records an accepted Meta request as sent, not delivered", () => {
  assert.equal(
    aggregateNotificationStatus([
      { success: false, status: "failed", provider: "whatsapp" },
      { success: true, status: "sent", provider: "whatsapp" },
    ]),
    "sent",
  );
  assert.equal(aggregateNotificationStatus([]), "not_configured");
});

test("SOS WhatsApp payload uses the approved argus_sos_alert template parameters", () => {
  const payload = buildSosTemplatePayload("9779860582174", {
    name: "Demo Trekker",
    trekkerId: "TRK-DEMO-001",
    deviceId: "ARGUS-ESP32-DEMO-01",
    severity: "critical (92/100)",
    route: "Mardi Himal",
    emergencyTime: timestamp,
    heartRate: "88 bpm",
    spo2: "97%",
    temperature: "36.7 C",
    altitude: "2950 m",
    symptom: "headache",
    sensorState: "valid",
    locationStatus: "fresh",
    trackingId: "event-123",
    mapUrl: "https://maps.google.com/?q=28.4572,83.9546",
    rescueUrl: "https://argus.test/rescue/event-123",
  });

  assert.equal(payload.template.name, "argus_sos_alert");
  assert.deepEqual(
    payload.template.components[0].parameters.map((parameter) => parameter.text),
    [
      "Demo Trekker",
      "TRK-DEMO-001",
      "critical (92/100)",
      "https://maps.google.com/?q=28.4572,83.9546",
      "https://argus.test/rescue/event-123",
    ],
  );
  assert.equal(payload.template.components.length, 1);
});

test("SOS WhatsApp payload adds a dynamic dashboard URL button only for non-argus_sos_alert templates", () => {
  const payload = buildSosTemplatePayload(
    "9779860582174",
    {
      name: "Demo Trekker",
      trekkerId: "TRK-DEMO-001",
      deviceId: "ARGUS-ESP32-DEMO-01",
      severity: "critical (92/100)",
      route: "Mardi Himal",
      emergencyTime: timestamp,
      heartRate: "88 bpm",
      spo2: "97%",
      temperature: "36.7 C",
      altitude: "2950 m",
      symptom: "headache",
      sensorState: "valid",
      locationStatus: "fresh",
      trackingId: "event-123",
      mapUrl: "https://maps.google.com/?q=28.4572,83.9546",
      rescueUrl: "https://argus.test/rescue/event-123",
      dashboardButtonParameter: "event-123",
    },
    "argus_sos_hackathon",
  );

  assert.deepEqual(payload.template.components[1], {
    type: "button",
    sub_type: "url",
    index: "0",
    parameters: [{ type: "text", text: "event-123" }],
  });
});

test("notification retry cooldown blocks rapid retries and then expires", () => {
  const now = Date.parse("2026-07-29T10:00:00Z");
  assert.equal(
    cooldownRemainingSeconds("2026-07-29T09:59:45Z", 60, now),
    45,
  );
  assert.equal(
    cooldownRemainingSeconds("2026-07-29T09:58:00Z", 60, now),
    0,
  );
});

test("notification retry uses only the fixed configured prototype recipient", () => {
  const route = readFileSync(
    new URL("../src/app/api/rescue/[id]/retry-notification/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /NOTIFICATION_RETRY_NOT_AVAILABLE/);
  assert.match(route, /\["failed", "not_configured"\]\.includes/);
  assert.match(route, /configuredWhatsAppRecipient\(\)/);
  assert.doesNotMatch(route, /emergency_contact|guide_mobile|whatsappTestRecipient/);
});

test("SOS migration preserves atomic request-id and cooldown duplicate handling", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/003_idempotency_and_integrity.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /where request_id = p_request_id/);
  assert.match(migration, /make_interval\(secs => p_cooldown_seconds\)/);
});

test("latest SOS migration reuses every unresolved SOS and permits in-flight attempts", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/012_single_active_sos_and_pending_attempts.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /where request_id = p_request_id/);
  assert.match(migration, /status in \('active', 'acknowledged'\)/);
  assert.doesNotMatch(migration, /created_at >=/);
  assert.match(migration, /'pending'/);
});

test("WhatsApp configuration requires all live provider fields", () => {
  const base = {
    demoMode: false,
    enabled: true,
    accessToken: "token",
    phoneNumberId: "123",
    businessAccountId: "456",
    templateName: "argus_sos_alert",
    recipientNumber: "9779860582174",
  };
  assert.equal(whatsappConfigurationReady(base), true);
  assert.equal(
    whatsappConfigurationReady({ ...base, accessToken: "" }),
    false,
  );
  assert.equal(
    whatsappConfigurationReady({ ...base, recipientNumber: "" }),
    false,
  );
  assert.equal(
    whatsappConfigurationReady({ ...base, demoMode: true, accessToken: "" }),
    true,
  );
});

test("verified webhook signatures use HMAC SHA-256", () => {
  const body = new TextEncoder().encode('{"object":"whatsapp_business_account"}');
  const secret = "test-app-secret";
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  assert.equal(verifyWebhookSignature(body, signature, secret), true);
  assert.equal(verifyWebhookSignature(body, "sha256=bad", secret), false);
});

test("WhatsApp webhook status mapping validates shape and prevents downgrades", () => {
  const events = extractWhatsAppStatusEvents({
    entry: [
      {
        changes: [
          {
            value: {
              statuses: [
                { id: "wamid.1", status: "delivered", timestamp: "1700000000" },
              ],
            },
          },
        ],
      },
    ],
  });
  assert.equal(events?.[0].status, "delivered");
  assert.equal(shouldApplyWhatsAppStatus("sent", "delivered"), true);
  assert.equal(shouldApplyWhatsAppStatus("read", "delivered"), false);
  assert.equal(shouldApplyWhatsAppStatus("delivered", "failed"), false);
  assert.equal(extractWhatsAppStatusEvents({ entry: "invalid" }), null);

  const invalidTimestamp = extractWhatsAppStatusEvents({
    entry: [
      {
        changes: [
          {
            value: {
              statuses: [
                { id: "wamid.2", status: "sent", timestamp: "9".repeat(400) },
              ],
            },
          },
        ],
      },
    ],
  });
  assert.match(invalidTimestamp?.[0].occurredAt || "", /^\d{4}-\d{2}-\d{2}T/);
});

test("rescue status validation allows only active, acknowledged, and resolved", () => {
  for (const status of ["active", "acknowledged", "resolved"]) {
    assert.equal(updateSosStatusSchema.safeParse({ status }).success, true);
  }
  assert.equal(
    updateSosStatusSchema.safeParse({ status: "cancelled" }).success,
    false,
  );
});

test("demo SOS requests require authority access", () => {
  const route = readFileSync(
    new URL("../src/app/api/sos/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /source === "demo"/);
  assert.match(route, /authorityAccessError\(request\)/);
});
