import { createHmac } from "node:crypto";

export const DEMO_IDS = Object.freeze({
  trekker: "TRK-DEMO-001",
  device: "ARGUS-ESP32-DEMO-01",
  resolvedSos: "00000000-0000-4000-8000-000000000101",
  activeSos: "00000000-0000-4000-8000-000000000102",
  resolvedAttempt: "00000000-0000-4000-8000-000000000201",
  activeAttempt: "00000000-0000-4000-8000-000000000202",
});

export const DEMO_PAIRING_CODE = "ARGUS123";

const READING_IDS = Array.from(
  { length: 8 },
  (_, index) => `00000000-0000-4000-8000-${String(301 + index).padStart(12, "0")}`,
);
const LOCATION_IDS = Array.from(
  { length: 5 },
  (_, index) => `00000000-0000-4000-8000-${String(401 + index).padStart(12, "0")}`,
);
const SYMPTOM_ID = "00000000-0000-4000-8000-000000000501";

function minutesBefore(now, minutes) {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

export function buildDemoData({
  now = new Date(),
  sessionSecret,
  activeSos = false,
  appUrl = "http://localhost:3000",
}) {
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }

  const readings = [
    [78, 98, 2760, 36.4, 42],
    [82, 97, 2795, 36.5, 36],
    [85, 97, 2830, 36.6, 30],
    [88, 96, 2860, 36.7, 24],
    [92, 95, 2890, 36.9, 18],
    [96, 96, 2915, 37.1, 12],
    [91, 97, 2935, 36.8, 6],
    [88, 97, 2950, 36.7, 1],
  ].map(([heartRate, spo2, altitude, temperature, minutes], index) => ({
    id: READING_IDS[index],
    trekker_id: DEMO_IDS.trekker,
    heart_rate: heartRate,
    spo2,
    altitude,
    temperature,
    temperature_kind: "ambient",
    sensor_state: "valid",
    device_id: DEMO_IDS.device,
    captured_at: minutesBefore(now, minutes),
    request_id: `argus-demo-reading-${index + 1}`,
  }));

  const locations = [
    [28.4416, 83.9434, 18, 2810, 34],
    [28.4451, 83.9461, 16, 2850, 25],
    [28.4492, 83.9489, 14, 2890, 16],
    [28.4534, 83.9518, 12, 2920, 7],
    [28.4572, 83.9546, 10, 2950, 1],
  ].map(([latitude, longitude, accuracy, altitude, minutes], index) => ({
    id: LOCATION_IDS[index],
    trekker_id: DEMO_IDS.trekker,
    latitude,
    longitude,
    accuracy_meters: accuracy,
    altitude,
    source: "demo",
    captured_at: minutesBefore(now, minutes),
    request_id: `argus-demo-location-${index + 1}`,
  }));

  const latestReading = readings.at(-1);
  const latestLocation = locations.at(-1);
  const mapUrl = `https://www.google.com/maps?q=${latestLocation.latitude},${latestLocation.longitude}`;
  const rescueUrl = `${appUrl.replace(/\/$/, "")}/rescue/${DEMO_IDS.resolvedSos}`;

  const resolvedSos = {
    id: DEMO_IDS.resolvedSos,
    trekker_id: DEMO_IDS.trekker,
    source: "demo",
    status: "resolved",
    sms_status: "simulated",
    severity_score: 42,
    severity_label: "moderate",
    severity_data_status: "sufficient",
    latitude: latestLocation.latitude,
    longitude: latestLocation.longitude,
    location_accuracy: latestLocation.accuracy_meters,
    location_captured_at: minutesBefore(now, 181),
    location_is_stale: false,
    heart_rate: latestReading.heart_rate,
    spo2: latestReading.spo2,
    altitude: latestReading.altitude,
    temperature: latestReading.temperature,
    sensor_state: "valid",
    device_id: DEMO_IDS.device,
    reading_captured_at: minutesBefore(now, 181),
    reading_is_stale: false,
    symptom: "headache",
    symptom_severity: "mild",
    symptom_notes: "Mild headache after gaining altitude.",
    rescue_url: rescueUrl,
    map_url: mapUrl,
    sms_message: "ARGUS demo SOS alert. No message was sent.",
    request_id: "argus-demo-resolved-sos",
    created_at: minutesBefore(now, 180),
    resolved_at: minutesBefore(now, 150),
  };

  const rows = {
    trekker: {
      id: DEMO_IDS.trekker,
      name: "Sarbagya Acharya",
      mobile_number: "+9779860582174",
      emergency_contact: "+9779860582174",
      guide_mobile: "+9779860582174",
      route_name: "Mardi Himal Trek",
      blood_group: "O+",
      medical_notes: "Demo record only. Sensor readings are not a medical diagnosis.",
      is_active: true,
    },
    device: {
      id: DEMO_IDS.device,
      trekker_id: DEMO_IDS.trekker,
      pairing_code_hash: createHmac("sha256", sessionSecret)
        .update(DEMO_PAIRING_CODE)
        .digest("hex"),
      is_active: true,
      last_seen_at: minutesBefore(now, 1),
    },
    readings,
    locations,
    symptom: {
      id: SYMPTOM_ID,
      trekker_id: DEMO_IDS.trekker,
      symptom: "headache",
      severity: "mild",
      notes: "Mild headache after gaining altitude.",
      request_id: "argus-demo-symptom",
      created_at: minutesBefore(now, 5),
    },
    resolvedSos,
    resolvedAttempt: {
      id: DEMO_IDS.resolvedAttempt,
      sos_event_id: DEMO_IDS.resolvedSos,
      phone_number: "9779860582174",
      provider: "demo",
      status: "simulated",
      message: "ARGUS demo notification. No Meta request was made.",
      request_id: "argus-demo-resolved-attempt",
      created_at: minutesBefore(now, 179),
    },
  };

  if (activeSos) {
    rows.activeSos = {
      ...resolvedSos,
      id: DEMO_IDS.activeSos,
      status: "active",
      severity_score: 58,
      severity_label: "high",
      rescue_url: `${appUrl.replace(/\/$/, "")}/rescue/${DEMO_IDS.activeSos}`,
      request_id: "argus-demo-active-sos",
      created_at: minutesBefore(now, 2),
      resolved_at: null,
      location_captured_at: latestLocation.captured_at,
      reading_captured_at: latestReading.captured_at,
    };
    rows.activeAttempt = {
      ...rows.resolvedAttempt,
      id: DEMO_IDS.activeAttempt,
      sos_event_id: DEMO_IDS.activeSos,
      request_id: "argus-demo-active-attempt",
      created_at: minutesBefore(now, 1),
    };
  }

  return rows;
}
