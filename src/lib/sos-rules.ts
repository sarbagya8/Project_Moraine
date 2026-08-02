import { ageSeconds, rescueUrl, universalMapUrl } from "./map-links";

export type SeverityLabel = "low" | "moderate" | "high" | "critical";

export type SeverityInput = {
  source: "physical_button" | "web_button" | "manual" | "demo";
  symptomSeverity?: "mild" | "moderate" | "severe" | "unspecified" | null;
  locationAvailable: boolean;
  locationIsStale: boolean;
  readingAvailable: boolean;
  readingIsStale: boolean;
  heartRate?: number | null;
  spo2?: number | null;
  temperature?: number | null;
};

export function calculateSeverity(input: SeverityInput) {
  let score = input.source === "physical_button" ? 25 : 15;

  if (input.symptomSeverity === "severe") score += 25;
  else if (input.symptomSeverity === "moderate") score += 15;
  else if (input.symptomSeverity === "mild") score += 5;

  if (!input.locationAvailable) score += 20;
  else if (input.locationIsStale) score += 10;

  if (!input.readingAvailable) score += 15;
  else if (input.readingIsStale) score += 8;

  if (
    input.heartRate != null &&
    (input.heartRate < 50 || input.heartRate > 120)
  ) {
    score += 10;
  }
  if (input.spo2 != null) {
    if (input.spo2 < 90) score += 15;
    else if (input.spo2 < 94) score += 8;
  }
  // ARGUS receives BMP280 ambient temperature. It is deliberately excluded
  // from health-risk scoring and must never be treated as body temperature.

  const severityScore = Math.min(100, score);
  const label: SeverityLabel =
    severityScore >= 75
      ? "critical"
      : severityScore >= 50
        ? "high"
        : severityScore >= 25
          ? "moderate"
          : "low";

  return {
    severityScore,
    severityLabel: label,
    dataStatus:
      input.locationAvailable && input.readingAvailable
        ? ("sufficient" as const)
        : ("insufficient_data" as const),
  };
}

export function locationStatus(
  available: boolean,
  isStale: boolean,
  capturedAt?: string | null,
) {
  if (!available) return "unavailable";
  if (!isStale) return "fresh";
  const age = capturedAt ? ageSeconds(capturedAt) : null;
  return age == null || !Number.isFinite(age)
    ? "stale"
    : `stale (${Math.ceil(age / 60)} minutes old)`;
}

export function buildSosMessage(input: {
  name: string;
  trekkerId: string;
  deviceId?: string;
  severityLabel: SeverityLabel;
  severityScore: number;
  route: string;
  emergencyTime: string;
  heartRate: string;
  spo2: string;
  temperature: string;
  altitude: string;
  symptom: string;
  sensorState?: string;
  locationStatus: string;
  trackingId: string;
  mapUrl: string;
  rescueUrl: string;
}) {
  return [
    "ARGUS SOS ALERT",
    "",
    `Name: ${input.name}`,
    `Trekker ID: ${input.trekkerId}`,
    `Device ID: ${input.deviceId || "unavailable"}`,
    `Severity: ${input.severityLabel} (${input.severityScore}/100)`,
    `Route: ${input.route}`,
    `Time: ${input.emergencyTime}`,
    `Heart rate: ${input.heartRate}`,
    `SpO2: ${input.spo2}`,
    `Ambient temperature: ${input.temperature}`,
    `Altitude: ${input.altitude}`,
    `Symptom: ${input.symptom}`,
    `Sensor state: ${input.sensorState || "unavailable"}`,
    `Location status: ${input.locationStatus}`,
    `Tracking ID: ${input.trackingId}`,
    `Map: ${input.mapUrl}`,
    `Rescue details: ${input.rescueUrl}`,
    "",
    "Readings are informational and are not a medical diagnosis.",
  ].join("\n");
}

export { rescueUrl, universalMapUrl };
