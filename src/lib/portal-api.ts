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
  ) {
    super(message);
  }
}

export async function portalRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    credentials: "include",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const json = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || !json?.success || json.data === undefined) {
    throw new PortalApiError(
      json?.error?.message || "The request could not be completed.",
      response.status,
      json?.error?.code,
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
  heartRate: number;
  spo2: number;
  altitude: number | null;
  temperature: number | null;
  capturedAt: string;
  ageSeconds?: number;
};

export type PortalDevice = {
  id: string;
  trekkerId: string | null;
  trekkerName?: string | null;
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt?: string;
};

export type PortalTrekker = {
  id: string;
  name: string;
  route: string | null;
  mobileNumber?: string | null;
  emergencyContact?: string | null;
  guideMobile?: string | null;
  bloodGroup?: string | null;
  medicalNotes?: string | null;
  isActive: boolean;
  device: PortalDevice | null;
  latestLocation: PortalLocation | null;
  latestReading: PortalReading | null;
  latestSymptom: {
    symptom: string;
    severity: string;
    notes: string | null;
    createdAt: string;
  } | null;
  readingHistory: PortalReading[];
  symptoms: Array<{
    symptom: string;
    severity: string;
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
  status: "active" | "acknowledged" | "resolved";
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
  freshness: { locationSeconds: number; readingSeconds: number };
  trekkers: PortalTrekker[];
  devices: PortalDevice[];
  emergencies: PortalEmergency[];
  notificationAttempts: NotificationAttempt[];
};

export type TrekkerOverview = {
  generatedAt: string;
  freshness: { locationSeconds: number; readingSeconds: number };
  trekker: { id: string; name: string; route: string | null };
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
    notes: string | null;
    createdAt: string;
  }>;
  emergencies: Array<{
    id: string;
    status: string;
    notificationStatus: string;
    severityScore: number | null;
    severityLabel: string | null;
    locationIsStale: boolean;
    readingIsStale: boolean;
    rescueUrl: string | null;
    createdAt: string;
  }>;
};

export function idempotencyHeaders(key = crypto.randomUUID()) {
  return { "x-idempotency-key": key };
}
