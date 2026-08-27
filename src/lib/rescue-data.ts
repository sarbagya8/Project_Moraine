export type RoutePoint = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  capturedAt: string;
};

export type SensorReading = {
  heartRate: number | null;
  spo2: number | null;
  altitude: number | null;
  temperature: number | null;
  sensorState?: string;
  capturedAt: string;
};

export type RescueRecord = {
  sos: {
    id: string;
    trekkerId?: string;
    trekkerName: string;
    route: string | null;
    bloodGroup?: string | null;
    dateOfBirth?: string | null;
    allergies?: string | null;
    knownConditions?: string | null;
    currentMedications?: string | null;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
    emergencyNotes?: string | null;
    medicalNotes?: string | null;
    activatedAt: string;
    resolvedAt?: string | null;
    source: string;
    deviceId?: string | null;
    hardwareEventId?: string | null;
    status: string;
    notificationStatus: string;
    severityScore?: number | null;
    severityLabel?: string | null;
    severityDataStatus?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    locationAccuracy?: number | null;
    locationCapturedAt?: string | null;
    locationAgeSeconds?: number | null;
    locationIsStale: boolean;
    latestSensorReading?:
      | (Partial<SensorReading> & { isStale?: boolean })
      | null;
    symptom?: string | null;
    symptomSeverity?: string | null;
    symptomNotes?: string | null;
    mapUrl?: string | null;
    rescueUrl?: string | null;
  };
  routeCoordinates: RoutePoint[];
  sensorHistory: SensorReading[];
  latestSymptom?: {
    symptom: string;
    severity: string;
    notes?: string | null;
    createdAt: string;
  } | null;
  notificationAttempts: Array<{
    provider: string | null;
    status: string;
    createdAt: string;
  }>;
  timeline: Array<{
    timestamp: string;
    type?: string;
    message: string;
  }>;
  disclaimer?: string;
};

export function formatAge(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "unknown age";
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3_600)}h ago`;
}

export function validCoordinate(
  latitude?: number | null,
  longitude?: number | null,
) {
  return (
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function routePositions(points: RoutePoint[]) {
  return points
    .filter((point) => validCoordinate(point.latitude, point.longitude))
    .sort(
      (a, b) =>
        new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime(),
    )
    .map((point) => [point.latitude, point.longitude] as [number, number]);
}
