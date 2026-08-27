export type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
};

export class PortalApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly requestId?: string,
  ) {
    super(message);
  }
}

export async function portalRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      cache: "no-store",
      credentials: "include",
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new PortalApiError("The request was cancelled.", 0, "REQUEST_ABORTED");
    }
    throw new PortalApiError(
      "The MORAINE server could not be reached.",
      0,
      "NETWORK_ERROR",
    );
  }

  const json = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  const requestId = response.headers.get("x-request-id") || undefined;
  if (!response.ok || !json?.success || json.data === undefined) {
    throw new PortalApiError(
      json?.error?.message || "The server returned an unexpected response.",
      response.status,
      json?.error?.code,
      requestId,
    );
  }
  return json.data;
}

export type PortalLocation = {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  capturedAt: string;
  ageSeconds: number;
};

export type PortalReading = {
  deviceId?: string;
  heartRate: number | null;
  spo2: number | null;
  sensorState: string | null;
  altitude: number | null;
  temperature: number | null;
  pressure: number | null;
  startAltitude: number | null;
  currentAltitude: number | null;
  averageSpeed: number | null;
  distance: number | null;
  amsStatus: string | null;
  fallDetected: boolean | null;
  fallType: string | null;
  sosCountdown: boolean | null;
  physicalSos: boolean | null;
  capturedAt: string;
  ageSeconds?: number;
};

export type PortalDevice = {
  id: string;
  displayName?: string | null;
  trekkerId: string | null;
  trekkerName?: string | null;
  isActive: boolean;
  lastSeenAt: string | null;
  firmwareVersion?: string | null;
  createdAt?: string;
};

export type PortalTrekker = {
  id: string;
  email?: string | null;
  name: string;
  route: string | null;
  mobileNumber?: string | null;
  emergencyContact?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  guideMobile?: string | null;
  bloodGroup?: string | null;
  medicalNotes?: string | null;
  allergies?: string | null;
  knownConditions?: string | null;
  currentMedications?: string | null;
  dateOfBirth?: string | null;
  address?: string | null;
  emergencyNotes?: string | null;
  emergencyContactRelationship?: string | null;
  secondaryEmergencyContactName?: string | null;
  secondaryEmergencyContactPhone?: string | null;
  preferredLanguage?: string | null;
  isActive: boolean;
  device: PortalDevice | null;
  latestLocation: PortalLocation | null;
  latestReading: PortalReading | null;
  latestSymptom: {
    symptom: string;
    severity: string;
    duration?: string | null;
    notes: string | null;
    createdAt: string;
  } | null;
  readingHistory: PortalReading[];
  symptoms: Array<{
    symptom: string;
    severity: string;
    duration?: string | null;
    notes: string | null;
    createdAt: string;
  }>;
};

export type PortalEmergency = {
  id: string;
  trekkerId: string;
  trekkerName: string;
  route: string | null;
  source: string;
  deviceId: string | null;
  hardwareEventId: string | null;
  sensorState: string | null;
  status: "active" | "new" | "acknowledged" | "in_progress" | "resolved" | "cancelled";
  notificationStatus: string;
  severityScore: number | null;
  severityLabel: string | null;
  severityDataStatus: string | null;
  latitude: number | null;
  longitude: number | null;
  locationAccuracy: number | null;
  locationCapturedAt: string | null;
  locationIsStale: boolean;
  heartRate: number | null;
  spo2: number | null;
  altitude: number | null;
  temperature: number | null;
  readingCapturedAt: string | null;
  readingIsStale: boolean;
  symptom: string | null;
  symptomSeverity: string | null;
  symptomNotes: string | null;
  mapUrl: string | null;
  rescueUrl: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type TrekkerEmergency = {
  id: string;
  trekkerId?: string;
  status: "active" | "new" | "acknowledged" | "in_progress" | "resolved" | "cancelled";
  notificationStatus: string;
  severityScore: number | null;
  severityLabel: string | null;
  severityDataStatus: string | null;
  locationIsStale: boolean;
  readingIsStale: boolean;
  rescueUrl: string | null;
  createdAt: string;
};

export function visibleCaseStatus(status: string) {
  return status === "active" ? "new" : status;
}

export function operationalPriority(input: {
  source: string;
  status: string;
  fallDetected?: boolean | null;
  symptomSeverity?: string | null;
  readingIsStale?: boolean;
  locationIsStale?: boolean;
}) {
  const reasons: string[] = [];
  let level: "low" | "medium" | "high" = "low";
  if (input.source === "physical_button" || input.source === "web_button") {
    level = "high";
    reasons.push("SOS activated");
  }
  if (input.fallDetected) {
    level = "high";
    reasons.push("fall detected");
  }
  if (["active", "new"].includes(input.status)) {
    if (level === "low") level = "medium";
    reasons.push("awaiting acknowledgement");
  }
  if (input.symptomSeverity === "severe") {
    level = "high";
    reasons.push("severe symptom reported");
  }
  if (input.readingIsStale) reasons.push("health context is stale");
  if (input.locationIsStale) reasons.push("location is stale");
  return { level, explanation: reasons.join("; ") || "no urgent operational signal recorded" };
}

export type NotificationAttempt = {
  id: string;
  sosEventId: string;
  trekkerId: string | null;
  recipient: string;
  provider: string;
  status: string;
  providerMessageId: string | null;
  error: string | null;
  createdAt: string;
};

export type AuthorityOverview = {
  generatedAt: string;
  hardwareSchemaReady: boolean;
  healthProfileSchemaReady: boolean;
  freshness: { locationSeconds: number; readingSeconds: number; deviceOnlineSeconds: number; deviceOfflineSeconds: number };
  trekkers: PortalTrekker[];
  devices: PortalDevice[];
  emergencies: PortalEmergency[];
  notificationAttempts: NotificationAttempt[];
};

export type TrekkerOverview = {
  generatedAt: string;
  hardwareSchemaReady: boolean;
  healthProfileSchemaReady: boolean;
  freshness: { locationSeconds: number; readingSeconds: number; deviceOnlineSeconds: number; deviceOfflineSeconds: number };
  trekker: { id: string; email?: string | null; name: string; route: string | null; dateOfBirth?: string | null; mobileNumber?: string | null; address?: string | null; bloodGroup?: string | null; allergies?: string | null; knownConditions?: string | null; currentMedications?: string | null; emergencyContactName?: string | null; emergencyContactPhone?: string | null; emergencyContactRelationship?: string | null; secondaryEmergencyContactName?: string | null; secondaryEmergencyContactPhone?: string | null; preferredLanguage?: string | null; emergencyContact?: string | null; healthNotes?: string | null; emergencyNotes?: string | null };
  device: PortalDevice | null;
  latestLocation: PortalLocation | null;
  routeCoordinates: Array<{
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
    capturedAt: string;
  }>;
  latestReading: PortalReading | null;
  readingHistory: PortalReading[];
  symptoms: Array<{
    id: string;
    symptom: string;
    severity: string;
    duration: string | null;
    notes: string | null;
    createdAt: string;
  }>;
  emergencies: TrekkerEmergency[];
};

export function idempotencyHeaders(key = crypto.randomUUID()) {
  return { "x-idempotency-key": key };
}
