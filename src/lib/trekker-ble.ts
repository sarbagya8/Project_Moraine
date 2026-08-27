import {
  ARGUS_BLE,
  ARGUS_READING_PERSIST_INTERVAL_MS,
  ARGUS_SENSOR_STALE_MS,
  ARGUS_SENSOR_STATES,
  type ArgusSensorState,
} from "./bluetooth/argus-ble-config";
import { z } from "zod";

export const ARGUS_BLE_SERVICE = ARGUS_BLE.service;
export { ARGUS_SENSOR_STALE_MS };

const QUEUE_KEY = "argus-ble-bridge-v3";
const MAX_QUEUE_ITEMS = 32;
const LOCATION_REFRESH_MS = 60_000;
const LOCATION_PERSIST_MS = 30_000;

export type BleIdentity = {
  deviceId: string;
  trekkerId: string | null;
  firmwareVersion: string | null;
  deviceName?: string;
  identitySource: "firmware" | "assigned_device";
};

export type BleReading = {
  deviceId: string;
  heartRate: number | null;
  spo2: number | null;
  temperature: number | null;
  temperatureType: "ambient" | null;
  altitude: number | null;
  capturedAt: string;
  deviceCapturedAtMs?: number;
  sensorState: ArgusSensorState;
  pressure: number | null;
  startAltitude: number | null;
  currentAltitude: number | null;
  averageSpeed: number | null;
  distance: number | null;
  amsStatus: string | null;
  fallDetected: boolean;
  fallType: string | null;
  sosCountdown: boolean;
  sosActive: boolean;
};

export type BleSos = {
  eventId: string;
  deviceId: string;
  trekkerId: string | null;
  pressedAt: string;
  devicePressedAtMs?: number;
  source: "physical_button";
};

export type GpsStatus =
  | "permission_not_requested"
  | "requesting"
  | "available"
  | "denied"
  | "unavailable"
  | "stale";

export type GpsSnapshot = {
  status: GpsStatus;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  altitude?: number;
  capturedAt?: string;
  ageMs?: number;
};

export type SosDeliveryState = {
  eventId: string;
  status: "countdown" | "sending" | "queued" | "confirmed" | "failed";
  message: string;
  trackingId?: string;
  notificationStatus?: string;
  duplicate?: boolean;
};

export type DatabaseSyncState =
  | "not started"
  | "syncing"
  | "pending sync"
  | "synced"
  | "failed";

export type BridgeQueueItem = {
  id: string;
  kind: "reading" | "location" | "sos";
  path: string;
  body: Record<string, unknown>;
  createdAt: string;
};

type BluetoothCharacteristic = EventTarget & {
  value?: DataView;
  properties?: {
    read?: boolean;
    notify?: boolean;
    indicate?: boolean;
    write?: boolean;
    writeWithoutResponse?: boolean;
  };
  readValue(): Promise<DataView>;
  startNotifications(): Promise<BluetoothCharacteristic>;
  stopNotifications?(): Promise<BluetoothCharacteristic>;
};

export function bleCharacteristicCapabilities(
  properties: BluetoothCharacteristic["properties"],
) {
  return {
    canRead: properties?.read === true,
    canNotify: properties?.notify === true,
  };
}
type BluetoothService = {
  getCharacteristic(uuid: string): Promise<BluetoothCharacteristic>;
};
type BluetoothServer = {
  connected: boolean;
  connect(): Promise<BluetoothServer>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<BluetoothService>;
};
type BluetoothDevice = EventTarget & {
  id?: string;
  name?: string;
  gatt?: BluetoothServer;
};
type BluetoothRequestOptions =
  | {
      filters: Array<{ services: string[] }>;
      optionalServices: string[];
    }
  | {
      acceptAllDevices: true;
      optionalServices: string[];
    };
type BluetoothApi = {
  requestDevice(options: BluetoothRequestOptions): Promise<BluetoothDevice>;
};

export type BleBridgeStatus =
  | "unsupported_browser"
  | "insecure_context"
  | "ready"
  | "connecting"
  | "connected"
  | "receiving_data"
  | "reconnecting"
  | "disconnected"
  | "permission_denied"
  | "device_mismatch";

export type BleDiscoveryMode = "service" | "diagnostic_all_devices";

export type BleConnectionStage =
  | "idle"
  | "chooser_opened"
  | "device_selected"
  | "gatt_connecting"
  | "gatt_connected"
  | "service_found"
  | "characteristic_found"
  | "identity_read"
  | "device_verified"
  | "notifications_started"
  | "receiving_data"
  | "disconnected"
  | "connection_failed";

export type BleBridgeHandlers = {
  onConnection(status: BleBridgeStatus): void;
  onStage(stage: BleConnectionStage): void;
  onDiagnosticFallbackAvailable(available: boolean): void;
  onMessage(message: string): void;
  onIdentity(identity: BleIdentity | null): void;
  onReading(reading: BleReading, synced: boolean): void;
  onSyncState(state: DatabaseSyncState): void;
  onSyncError(message: string | null): void;
  onLocation(snapshot: GpsSnapshot): void;
  onSosState(state: SosDeliveryState): void;
};

export function detectBleEnvironment(
  hasBluetooth: boolean,
  secureContext: boolean,
): BleBridgeStatus {
  if (!hasBluetooth) return "unsupported_browser";
  if (!secureContext) return "insecure_context";
  return "ready";
}

export function bluetoothDiscoveryOptions(
  mode: BleDiscoveryMode,
): BluetoothRequestOptions {
  if (mode === "diagnostic_all_devices") {
    return {
      acceptAllDevices: true,
      optionalServices: [ARGUS_BLE.service],
    };
  }
  return {
    filters: [{ services: [ARGUS_BLE.service] }],
    optionalServices: [ARGUS_BLE.service],
  };
}

function bluetoothApi() {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { bluetooth?: BluetoothApi }).bluetooth;
}

function bleDiagnostic(event: string, details: Record<string, unknown> = {}) {
  console.info("[ARGUS BLE]", event, details);
}

function connectionActionMessage(operation: string, error: unknown) {
  switch (operation) {
    case "gatt_connect":
      return "GATT connection failed. Disconnect the wristband from mobile BLE apps or other phones, keep it nearby, and retry.";
    case "argus_service_discovery":
      return `The selected device does not expose ARGUS service ${ARGUS_BLE.service}.`;
    case "required_characteristic_discovery":
      return `The selected device does not expose ARGUS characteristic ${ARGUS_BLE.characteristic}.`;
    case "backend_device_verification":
      return "Device verification failed for this signed-in user.";
    case "notification_subscription":
      return error instanceof Error
        ? error.message
        : "The confirmed ARGUS characteristic could not start notifications.";
    case "initial_characteristic_read":
      return "ARGUS connected, but its current BLE packet could not be processed.";
    default:
      return error instanceof Error ? error.message : "BLE connection failed.";
  }
}

function hexadecimalBytes(value: DataView) {
  return Array.from(
    new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join(" ");
}

function nullablePacketInteger(value: string) {
  if (["", "null", "--"].includes(value.toLowerCase())) return null;
  if (!/^\d{1,3}$/.test(value)) return undefined;
  return Number(value);
}

const finiteTelemetryNumber = z.number().finite();

export const esp32TelemetryPacketSchema = z
  .object({
    hr: finiteTelemetryNumber,
    spo2: finiteTelemetryNumber,
    altitude: finiteTelemetryNumber.optional(),
    pressure: finiteTelemetryNumber.optional(),
    temperature: finiteTelemetryNumber.optional(),
    start_altitude: finiteTelemetryNumber.optional(),
    current_altitude: finiteTelemetryNumber.optional(),
    average_speed: finiteTelemetryNumber.optional(),
    distance: finiteTelemetryNumber.optional(),
    ams: z.string().trim().max(80).optional(),
    fall: z.boolean().optional(),
    fall_type: z.string().trim().max(80).optional(),
    sos_countdown: z.boolean().optional(),
    sos: z.boolean().optional(),
  })
  .passthrough();

export type Esp32TelemetryPacket = z.infer<typeof esp32TelemetryPacketSchema>;

function rangedTelemetryNumber(
  value: number | undefined,
  minimum: number,
  maximum: number,
) {
  return value !== undefined && value >= minimum && value <= maximum
    ? value
    : null;
}

export function normalizeEsp32TelemetryPacket(
  value: unknown,
  deviceId: string,
  receivedAt = new Date(),
): BleReading | null {
  const result = esp32TelemetryPacketSchema.safeParse(value);
  if (!result.success) return null;
  const packet = result.data;
  const validHeartRate = packet.hr >= 20 && packet.hr <= 240;
  const validSpo2 = packet.spo2 >= 50 && packet.spo2 <= 100;
  const bothUnavailable = packet.hr <= 0 && packet.spo2 <= 0;
  const sensorState: ArgusSensorState =
    validHeartRate && validSpo2
      ? "valid"
      : bothUnavailable
        ? "no_finger"
        : "invalid";
  const currentAltitude = rangedTelemetryNumber(
    packet.current_altitude ?? packet.altitude,
    -500,
    9_000,
  );
  return {
    deviceId,
    heartRate: sensorState === "valid" ? Math.round(packet.hr) : null,
    spo2: sensorState === "valid" ? packet.spo2 : null,
    altitude: currentAltitude,
    pressure: rangedTelemetryNumber(packet.pressure, 100, 1_200),
    temperature: rangedTelemetryNumber(packet.temperature, -50, 80),
    temperatureType:
      rangedTelemetryNumber(packet.temperature, -50, 80) === null
        ? null
        : "ambient",
    startAltitude: rangedTelemetryNumber(packet.start_altitude, -500, 9_000),
    currentAltitude,
    averageSpeed: rangedTelemetryNumber(packet.average_speed, 0, 100),
    distance: rangedTelemetryNumber(packet.distance, 0, 10_000_000),
    amsStatus: packet.ams?.trim() || null,
    fallDetected: packet.fall ?? false,
    fallType: packet.fall_type?.trim() || null,
    sosCountdown: packet.sos_countdown ?? false,
    sosActive: packet.sos ?? false,
    capturedAt: receivedAt.toISOString(),
    sensorState,
  };
}

export type ArgusPacketAssemblyResult = {
  packets: unknown[];
  buffered: boolean;
  droppedIncomplete: boolean;
  parseError: string | null;
};

export function telemetryBooleanTransition(previous: boolean, current: boolean) {
  return {
    activated: !previous && current,
    reset: previous && !current,
  };
}

export class ArgusJsonPacketAssembler {
  private buffer = "";
  private readonly maxBufferLength = 4096;

  reset() {
    this.buffer = "";
  }

  push(rawChunk: string): ArgusPacketAssemblyResult {
    const chunk = rawChunk.replace(/[\0\s]+$/g, "").trim();
    if (!chunk) {
      return { packets: [], buffered: false, droppedIncomplete: false, parseError: null };
    }

    if (!chunk.startsWith("{") && this.buffer.length === 0) {
      const packet = parseArgusTextPacket(chunk);
      return {
        packets: packet === null ? [] : [packet],
        buffered: false,
        droppedIncomplete: false,
        parseError: packet === null ? "unsupported packet format" : null,
      };
    }

    let droppedIncomplete = false;
    if (this.buffer && chunk.startsWith("{")) {
      this.buffer = "";
      droppedIncomplete = true;
    }
    this.buffer += chunk;
    if (this.buffer.length > this.maxBufferLength) {
      this.buffer = "";
      return {
        packets: [],
        buffered: false,
        droppedIncomplete: true,
        parseError: "BLE JSON buffer limit exceeded",
      };
    }

    let depth = 0;
    let inString = false;
    let escaped = false;
    let completeAt = -1;
    for (let index = 0; index < this.buffer.length; index += 1) {
      const character = this.buffer[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\" && inString) {
        escaped = true;
        continue;
      }
      if (character === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (character === "{") depth += 1;
      if (character === "}") depth -= 1;
      if (depth === 0 && character === "}") {
        completeAt = index;
        break;
      }
    }
    if (completeAt < 0) {
      return {
        packets: [],
        buffered: true,
        droppedIncomplete,
        parseError: null,
      };
    }

    const json = this.buffer.slice(0, completeAt + 1);
    this.buffer = this.buffer.slice(completeAt + 1).trim();
    try {
      return {
        packets: [JSON.parse(json) as unknown],
        buffered: this.buffer.length > 0,
        droppedIncomplete,
        parseError: null,
      };
    } catch (error) {
      return {
        packets: [],
        buffered: this.buffer.length > 0,
        droppedIncomplete,
        parseError: error instanceof Error ? error.message.slice(0, 120) : "invalid JSON",
      };
    }
  }
}

export function parseArgusTextPacket(text: string): unknown {
  const trimmed = text.replace(/[\0\s]+$/g, "").trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return null;
    }
  }

  const fields = trimmed.split("|");
  if (fields[0] === "INFO" && (fields.length === 2 || fields.length === 3)) {
    return {
      type: "device_info",
      deviceId: fields[1],
      ...(fields.length === 3 && fields[2]
        ? { firmwareVersion: fields[2] }
        : {}),
    };
  }
  if (fields[0] === "DATA" && fields.length === 4) {
    const heartRate = nullablePacketInteger(fields[1]);
    const spo2 = nullablePacketInteger(fields[2]);
    if (heartRate === undefined || spo2 === undefined) return null;
    return {
      type: "sensor",
      heartRate,
      spo2,
      temperature: null,
      temperatureType: null,
      altitude: null,
      sensorState: fields[3],
    };
  }
  if (fields[0] === "SOS" && fields.length === 2) {
    return {
      type: "sos",
      eventId: fields[1],
      source: "physical_button",
    };
  }

  // Compatibility for the deployed three-field sensor-only CSV packet.
  const csv = trimmed.split(",");
  if (csv.length === 3) {
    const heartRate = nullablePacketInteger(csv[0].trim());
    const spo2 = nullablePacketInteger(csv[1].trim());
    if (heartRate === undefined || spo2 === undefined) return null;
    return {
      type: "sensor",
      heartRate,
      spo2,
      temperature: null,
      temperatureType: null,
      altitude: null,
      sensorState: csv[2].trim(),
    };
  }
  return null;
}

function decodeBleText(value: DataView): string | null {
  const bytes = value.buffer.slice(
    value.byteOffset,
    value.byteOffset + value.byteLength,
  );
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    bleDiagnostic("payload_decode_failed", {
      byteLength: value.byteLength,
      hexadecimalBytes: hexadecimalBytes(value),
    });
    return null;
  }
  bleDiagnostic("payload_received", {
    byteLength: value.byteLength,
    decodedUtf8Text: text.slice(0, 240),
  });
  return text;
}

function decodeBlePacket(value: DataView): unknown {
  const text = decodeBleText(value);
  if (text === null) return null;
  const packet = parseArgusTextPacket(text.replace(/\0+$/g, "").trim());
  bleDiagnostic("payload_decode_result", {
    parsed: packet !== null,
    packetType:
      isRecord(packet) && typeof packet.type === "string"
        ? packet.type
        : "invalid",
  });
  return packet;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shortString(value: unknown, max = 100) {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= max
    ? value.trim()
    : null;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function parseBleIdentity(value: unknown): BleIdentity | null {
  if (!isRecord(value) || value.type !== "device_info") return null;
  const deviceId = shortString(value.deviceId);
  const firmwareVersion =
    value.firmwareVersion == null
      ? null
      : shortString(value.firmwareVersion, 40);
  const trekkerId = value.trekkerId == null ? null : shortString(value.trekkerId);
  if (
    !deviceId ||
    (value.firmwareVersion != null && !firmwareVersion) ||
    (value.trekkerId != null && !trekkerId)
  ) {
    return null;
  }
  return {
    deviceId,
    trekkerId,
    firmwareVersion,
    identitySource: "firmware",
  };
}

export function parseBleReading(
  value: unknown,
  verifiedDeviceId?: string,
  receivedAt = new Date(),
): BleReading | null {
  if (!isRecord(value)) return null;
  const deviceId = shortString(value.deviceId) ?? verifiedDeviceId ?? null;
  const sensorState =
    typeof value.sensorState === "string" &&
    ARGUS_SENSOR_STATES.includes(value.sensorState as ArgusSensorState)
      ? (value.sensorState as ArgusSensorState)
      : null;
  if (!deviceId || !sensorState) return null;

  const heartRate = nullableNumber(value.heartRate);
  const spo2 = nullableNumber(value.spo2);
  const temperature = nullableNumber(value.temperature);
  const altitude = nullableNumber(value.altitude);
  if (
    heartRate === undefined ||
    spo2 === undefined ||
    temperature === undefined ||
    altitude === undefined
  ) {
    return null;
  }
  const temperatureType =
    temperature === null
      ? null
      : value.temperatureType === "ambient"
        ? "ambient"
        : undefined;
  if (temperatureType === undefined) return null;
  if (
    sensorState === "valid" &&
    (heartRate === null ||
      spo2 === null ||
      heartRate < 20 ||
      heartRate > 240 ||
      spo2 < 50 ||
      spo2 > 100)
  ) {
    return null;
  }
  if (sensorState !== "valid" && (heartRate !== null || spo2 !== null)) {
    return null;
  }

  const numericCapture =
    typeof value.capturedAt === "number" &&
    Number.isInteger(value.capturedAt) &&
    value.capturedAt >= 0 &&
    value.capturedAt <= 0xFFFFFFFF
      ? value.capturedAt
      : undefined;
  const stringCapture = shortString(value.capturedAt, 40);
  const capturedAt =
    numericCapture === undefined
      ? stringCapture ?? receivedAt.toISOString()
      : receivedAt.toISOString();
  if (!capturedAt || !Number.isFinite(Date.parse(capturedAt))) return null;

  return {
    deviceId,
    heartRate,
    spo2,
    temperature,
    temperatureType,
    altitude,
    capturedAt,
    ...(numericCapture === undefined
      ? {}
      : { deviceCapturedAtMs: numericCapture }),
    sensorState,
    pressure: null,
    startAltitude: null,
    currentAltitude: altitude,
    averageSpeed: null,
    distance: null,
    amsStatus: null,
    fallDetected: false,
    fallType: null,
    sosCountdown: false,
    sosActive: false,
  };
}

export function parseBleSos(
  value: unknown,
  receivedAt = new Date(),
): BleSos | null {
  if (!isRecord(value)) return null;
  const eventId = shortString(value.eventId);
  const deviceId = shortString(value.deviceId);
  const trekkerId = value.trekkerId == null ? null : shortString(value.trekkerId);
  const numericPressedAt =
    typeof value.pressedAt === "number" &&
    Number.isInteger(value.pressedAt) &&
    value.pressedAt >= 0 &&
    value.pressedAt <= 0xFFFFFFFF
      ? value.pressedAt
      : undefined;
  const stringPressedAt = shortString(value.pressedAt, 40);
  const pressedAt =
    numericPressedAt === undefined
      ? stringPressedAt ?? receivedAt.toISOString()
      : receivedAt.toISOString();
  if (
    !eventId ||
    !/^[A-Za-z0-9._:-]+$/.test(eventId) ||
    !deviceId ||
    (value.trekkerId != null && !trekkerId) ||
    !pressedAt ||
    !Number.isFinite(Date.parse(pressedAt)) ||
    value.source !== "physical_button"
  ) {
    return null;
  }
  return {
    eventId,
    deviceId,
    trekkerId,
    pressedAt,
    ...(numericPressedAt === undefined
      ? {}
      : { devicePressedAtMs: numericPressedAt }),
    source: "physical_button",
  };
}

export type ParsedArgusPacket =
  | { type: "sensor"; reading: BleReading }
  | { type: "sos"; sos: BleSos };

export function parseArgusPacket(
  value: unknown,
  verifiedDeviceId?: string,
  receivedAt = new Date(),
): ParsedArgusPacket | null {
  if (!isRecord(value)) return null;
  if ("hr" in value && "spo2" in value && verifiedDeviceId) {
    const reading = normalizeEsp32TelemetryPacket(
      value,
      verifiedDeviceId,
      receivedAt,
    );
    return reading ? { type: "sensor", reading } : null;
  }
  const packetType =
    typeof value.type === "string"
      ? value.type
      : "eventId" in value
        ? "sos"
        : "sensorState" in value
          ? "sensor"
          : null;
  if (packetType === "sos") {
    const deviceId = shortString(value.deviceId) ?? verifiedDeviceId ?? null;
    if (!deviceId) return null;
    const sos = parseBleSos({ ...value, deviceId }, receivedAt);
    return sos ? { type: "sos", sos } : null;
  }
  if (packetType === "sensor") {
    const reading = parseBleReading(value, verifiedDeviceId, receivedAt);
    return reading ? { type: "sensor", reading } : null;
  }
  return null;
}

function readQueue(): BridgeQueueItem[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]") as unknown;
    return Array.isArray(value)
      ? (value.filter(
          (item) =>
            isRecord(item) &&
            typeof item.id === "string" &&
            ["reading", "location", "sos"].includes(String(item.kind)),
        ) as BridgeQueueItem[])
      : [];
  } catch {
    return [];
  }
}

function writeQueue(items: BridgeQueueItem[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(0, MAX_QUEUE_ITEMS)));
  } catch {
    // Live monitoring must continue even when storage is disabled or full.
  }
}

export function prioritizeBridgeQueue(items: BridgeQueueItem[]) {
  return [...items].sort((a, b) => {
    if (a.kind === b.kind) return a.createdAt.localeCompare(b.createdAt);
    if (a.kind === "sos") return -1;
    if (b.kind === "sos") return 1;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

function enqueue(item: BridgeQueueItem) {
  writeQueue(
    prioritizeBridgeQueue([
      item,
      ...readQueue().filter((queued) => queued.id !== item.id),
    ]),
  );
}

function activeTelemetrySosId(storageKey: string) {
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function storeActiveTelemetrySosId(storageKey: string, eventId: string | null) {
  try {
    if (eventId) localStorage.setItem(storageKey, eventId);
    else localStorage.removeItem(storageKey);
  } catch {
    // The in-memory edge detector still prevents repeated packets this session.
  }
}

function requestPhoneLocation(timeoutMs: number, maximumAgeMs: number) {
  if (!navigator.geolocation) {
    return Promise.reject(new Error("Phone GPS is unavailable."));
  }
  return new Promise<GeolocationPosition>((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: timeoutMs,
      maximumAge: maximumAgeMs,
    }),
  );
}

function locationBody(deviceId: string, position: GeolocationPosition) {
  return {
    deviceId,
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyMeters: position.coords.accuracy,
    ...(position.coords.altitude == null
      ? {}
      : { altitude: position.coords.altitude }),
    capturedAt: new Date(position.timestamp).toISOString(),
  };
}

export function gpsStatusForTimestamp(
  capturedAt: string | null | undefined,
  staleAfterMs: number,
  now = Date.now(),
): "available" | "stale" | "unavailable" {
  if (!capturedAt) return "unavailable";
  const timestamp = Date.parse(capturedAt);
  if (!Number.isFinite(timestamp)) return "unavailable";
  return now - timestamp > staleAfterMs ? "stale" : "available";
}

function gpsSnapshot(
  position: GeolocationPosition,
  staleAfterMs: number,
  now = Date.now(),
): GpsSnapshot {
  const ageMs = Math.max(0, now - position.timestamp);
  return {
    status: gpsStatusForTimestamp(
      new Date(position.timestamp).toISOString(),
      staleAfterMs,
      now,
    ),
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyMeters: position.coords.accuracy,
    ...(position.coords.altitude == null
      ? {}
      : { altitude: position.coords.altitude }),
    capturedAt: new Date(position.timestamp).toISOString(),
    ageMs,
  };
}

async function sendQueued(item: BridgeQueueItem) {
  const response = await fetch(item.path, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "x-idempotency-key": item.id,
    },
    body: JSON.stringify(item.body),
  });
  const requestId = response.headers.get("x-request-id") || undefined;
  const result = (await response.json().catch(() => null)) as {
    success?: boolean;
    data?: {
      duplicate?: boolean;
      databaseStatus?: string;
      event?: { id?: string; notificationStatus?: string };
    };
    error?: { code?: string; message?: string };
  } | null;
  if (!response.ok || !result?.success) {
    const code = result?.error?.code || "BRIDGE_REQUEST_FAILED";
    const diagnostic = [
      `HTTP ${response.status}`,
      requestId ? `request ${requestId}` : null,
    ].filter(Boolean).join(", ");
    throw new Error(
      `${result?.error?.message || "Bridge request failed."} [${code}; ${diagnostic}]`,
    );
  }
  return result.data ?? {};
}

export class TrekkerBleBridge {
  private device: BluetoothDevice | null = null;
  private server: BluetoothServer | null = null;
  private service: BluetoothService | null = null;
  private argusCharacteristic: BluetoothCharacteristic | null = null;
  private identity: BleIdentity | null = null;
  private latestValidReading: BleReading | null = null;
  private latestLocation: GeolocationPosition | null = null;
  private latestLocationPersistedAt = 0;
  private lastReadingPersistedAt = 0;
  private lastPersistedSensorState: ArgusSensorState | null = null;
  private seenSosIds = new Set<string>();
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private locationTimer: number | null = null;
  private flushPromise: Promise<void> | null = null;
  private manuallyDisconnected = false;
  private destroyed = false;
  private gpsStatus: GpsStatus = "permission_not_requested";
  private connectionStage: BleConnectionStage = "idle";
  private discoveryMode: BleDiscoveryMode = "service";
  private connectionOperation = "idle";
  private readonly online = () => void this.flushQueue();
  private readonly packetAssembler = new ArgusJsonPacketAssembler();
  private lastTelemetrySosActive = false;
  private lastTelemetryFallDetected = false;
  private lastPersistedTelemetryState = "";

  constructor(
    private readonly expected: { deviceId: string },
    private readonly handlers: BleBridgeHandlers,
    private readonly locationStaleMs = 120_000,
  ) {}

  environmentStatus(): BleBridgeStatus {
    return detectBleEnvironment(Boolean(bluetoothApi()), window.isSecureContext);
  }

  async connect(mode: BleDiscoveryMode = "service") {
    const environment = this.environmentStatus();
    if (environment !== "ready") {
      this.handlers.onConnection(environment);
      this.handlers.onMessage(
        environment === "insecure_context"
          ? "Web Bluetooth requires localhost or HTTPS."
          : "Use Chrome or Edge on localhost or HTTPS, enable Bluetooth, and keep the ARGUS wristband nearby.",
      );
      return;
    }

    this.manuallyDisconnected = false;
    this.destroyed = false;
    this.discoveryMode = mode;
    this.handlers.onDiagnosticFallbackAvailable(false);
    this.handlers.onConnection("connecting");
    try {
      this.releaseDevice(true);
      this.setConnectionStage("chooser_opened");
      this.connectionOperation = "device_chooser";
      this.device = await bluetoothApi()!.requestDevice(
        bluetoothDiscoveryOptions(mode),
      );
      this.setConnectionStage("device_selected", {
        deviceName: this.device.name ?? null,
        discoveryMode: mode,
      });
      this.device.addEventListener("gattserverdisconnected", this.disconnected);
      await this.connectKnownDevice();
    } catch (error) {
      const failedStage = this.connectionStage;
      this.setConnectionStage("connection_failed", {
        failedStage,
        failedOperation: this.connectionOperation,
        discoveryMode: mode,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage:
          error instanceof Error ? error.message.slice(0, 180) : "BLE connection failed.",
      });
      if (error instanceof DOMException && error.name === "NotFoundError") {
        if (mode === "service") {
          this.handlers.onDiagnosticFallbackAvailable(true);
        }
        this.handlers.onConnection("permission_denied");
        this.handlers.onMessage(
          "The Bluetooth chooser closed without a device. It may have been cancelled, permission may have been denied, or no service-filtered device appeared.",
        );
      } else {
        if (!this.identity) this.handlers.onConnection("disconnected");
        this.handlers.onMessage(
          connectionActionMessage(this.connectionOperation, error),
        );
      }
      this.releaseDevice(true);
    }
  }

  private setConnectionStage(
    stage: BleConnectionStage,
    details: Record<string, unknown> = {},
  ) {
    this.connectionStage = stage;
    this.handlers.onStage(stage);
    bleDiagnostic(stage, details);
  }

  disconnect() {
    this.manuallyDisconnected = true;
    this.clearTimers();
    this.releaseDevice(true);
    this.setConnectionStage("disconnected", { manual: true });
    if (!this.destroyed) {
      this.handlers.onConnection("disconnected");
      this.handlers.onMessage("Wristband disconnected. Stored data is now stale.");
    }
  }

  destroy() {
    this.destroyed = true;
    this.disconnect();
  }

  async retrySos(eventId: string) {
    const pending = readQueue().some(
      (item) => item.kind === "sos" && item.id === eventId,
    );
    if (!pending) return;
    this.handlers.onSosState({
      eventId,
      status: navigator.onLine ? "sending" : "queued",
      message: navigator.onLine
        ? "Retrying the same SOS event safely."
        : "SOS remains saved until internet returns.",
    });
    await this.flushQueue();
  }

  private async connectKnownDevice() {
    if (!this.device?.gatt) throw new Error("The wristband has no GATT server.");
    this.detachCharacteristics();
    this.setConnectionStage("gatt_connecting", {
      deviceName: this.device.name ?? null,
    });
    const server = this.device.gatt.connected
      ? this.device.gatt
      : await (async () => {
          this.connectionOperation = "gatt_connect";
          return this.device!.gatt!.connect();
        })();
    this.server = server;
    this.setConnectionStage("gatt_connected", {
      deviceName: this.device.name ?? null,
    });
    this.connectionOperation = "argus_service_discovery";
    const service = await server.getPrimaryService(ARGUS_BLE.service);
    this.service = service;
    this.setConnectionStage("service_found", {
      serviceUuid: ARGUS_BLE.service,
    });
    this.connectionOperation = "required_characteristic_discovery";
    const argusCharacteristic = await service.getCharacteristic(
      ARGUS_BLE.characteristic,
    );
    const characteristicProperties = argusCharacteristic.properties;
    const capabilities = bleCharacteristicCapabilities(
      characteristicProperties,
    );
    bleDiagnostic("characteristic_properties", {
      read: characteristicProperties?.read ?? null,
      notify: characteristicProperties?.notify ?? null,
      indicate: characteristicProperties?.indicate ?? null,
      write: characteristicProperties?.write ?? null,
      writeWithoutResponse:
        characteristicProperties?.writeWithoutResponse ?? null,
    });
    this.setConnectionStage("characteristic_found", {
      characteristicUuid: ARGUS_BLE.characteristic,
    });
    let initialPacket: unknown = null;
    let firmwareIdentity: BleIdentity | null = null;
    this.connectionOperation = "device_identity_read";
    const readSupported = capabilities.canRead;
    bleDiagnostic("identity_read_capability", {
      supported: readSupported,
    });
    if (readSupported) {
      try {
        const initialValue = await argusCharacteristic.readValue();
        initialPacket = decodeBlePacket(initialValue);
        firmwareIdentity = parseBleIdentity(initialPacket);
        bleDiagnostic("identity_parsing_result", {
          parsed: Boolean(firmwareIdentity),
          firmwareVersionPresent: Boolean(firmwareIdentity?.firmwareVersion),
          messageType:
            isRecord(initialPacket) && typeof initialPacket.type === "string"
              ? initialPacket.type
              : "unknown",
        });
      } catch (error) {
        // READ is an optional capability for deployed prototype firmware. The
        // confirmed GATT contract plus the authenticated Trekker's assigned
        // device is sufficient to continue to notifications safely.
        bleDiagnostic("identity_read_failed", {
          errorName: error instanceof Error ? error.name : "UnknownError",
          errorMessage:
            error instanceof Error ? error.message.slice(0, 120) : "Read failed",
          continuingWithAssignedDevice: true,
        });
      }
    } else {
      bleDiagnostic("identity_read_skipped", {
        reason: "characteristic_read_unsupported",
      });
    }
    if (
      firmwareIdentity &&
      firmwareIdentity.deviceId !== this.expected.deviceId
    ) {
      this.handlers.onConnection("device_mismatch");
      server.disconnect();
      throw new Error(
        "The selected ARGUS wristband is not the device assigned to this user.",
      );
    }
    const identity: BleIdentity = firmwareIdentity ?? {
      deviceId: this.expected.deviceId,
      trekkerId: null,
      firmwareVersion: null,
      identitySource: "assigned_device",
    };
    identity.deviceName = this.device.name;
    this.setConnectionStage("identity_read", {
      deviceId: identity.deviceId,
      deviceName: identity.deviceName ?? null,
      firmwareVersion: identity.firmwareVersion,
      identitySource: identity.identitySource,
    });

    this.connectionOperation = "backend_device_verification";
    const verification = await fetch("/api/trekker/device/verify", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(identity),
    });
    const verificationBody = (await verification.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    if (!verification.ok) {
      bleDiagnostic("device_verification", {
        deviceId: identity.deviceId,
        verified: false,
        httpStatus: verification.status,
      });
      this.handlers.onConnection("device_mismatch");
      server.disconnect();
      throw new Error(
        verificationBody?.error?.message ||
          "This wristband is unknown, unassigned, or assigned to another user.",
      );
    }
    this.setConnectionStage("device_verified", {
      deviceId: identity.deviceId,
      httpStatus: verification.status,
      identitySource: identity.identitySource,
    });

    this.identity = identity;
    this.handlers.onIdentity(identity);
    this.argusCharacteristic = argusCharacteristic;
    this.argusCharacteristic.removeEventListener(
      "characteristicvaluechanged",
      this.receivedArgusData,
    );
    this.argusCharacteristic.addEventListener(
      "characteristicvaluechanged",
      this.receivedArgusData,
    );
    const properties = this.argusCharacteristic.properties;
    if (!bleCharacteristicCapabilities(properties).canNotify) {
      throw new Error("The confirmed ARGUS characteristic does not support notifications.");
    }
    this.connectionOperation = "notification_subscription";
    await this.argusCharacteristic.startNotifications();
    bleDiagnostic("notification_start_result", { started: true });
    this.setConnectionStage("notifications_started");

    window.addEventListener("online", this.online);
    this.reconnectAttempts = 0;
    this.handlers.onConnection("connected");
    this.handlers.onMessage(
      identity.identitySource === "firmware"
        ? "Wristband verified. Waiting for MAX30102 data."
        : "ARGUS GATT contract verified using the assigned device. Firmware version is unavailable; waiting for MAX30102 data.",
    );
    this.startLocationRefresh();

    // Older deployed firmware may expose a sensor/SOS packet as its readable
    // current value. Process it only after the assigned device is verified.
    this.connectionOperation = "initial_characteristic_read";
    if (parseArgusPacket(initialPacket, identity.deviceId)) {
      await this.handleArgusPacket(initialPacket);
    }
    await this.flushQueue();
    this.connectionOperation = "ready";
  }

  private detachCharacteristics() {
    const characteristic = this.argusCharacteristic;
    this.argusCharacteristic?.removeEventListener(
      "characteristicvaluechanged",
      this.receivedArgusData,
    );
    if (characteristic?.stopNotifications) {
      void characteristic.stopNotifications().catch(() => undefined);
    }
    this.argusCharacteristic = null;
    this.service = null;
    this.server = null;
    this.packetAssembler.reset();
  }

  private releaseDevice(disconnectGatt: boolean) {
    window.removeEventListener("online", this.online);
    this.detachCharacteristics();
    if (this.device) {
      this.device.removeEventListener("gattserverdisconnected", this.disconnected);
      if (disconnectGatt && this.device.gatt?.connected) this.device.gatt.disconnect();
    }
    this.device = null;
    this.identity = null;
    if (!this.destroyed) this.handlers.onIdentity(null);
  }

  private clearTimers() {
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    if (this.locationTimer !== null) window.clearInterval(this.locationTimer);
    this.reconnectTimer = null;
    this.locationTimer = null;
  }

  private readonly disconnected = () => {
    this.setConnectionStage("disconnected", { manual: false });
    this.detachCharacteristics();
    if (this.locationTimer !== null) window.clearInterval(this.locationTimer);
    this.locationTimer = null;
    if (this.manuallyDisconnected || this.destroyed) return;
    this.handlers.onConnection("reconnecting");
    this.handlers.onMessage("Wristband disconnected. ARGUS is attempting to reconnect.");
    this.scheduleReconnect();
  };

  private scheduleReconnect() {
    if (this.manuallyDisconnected || this.destroyed || !this.device) return;
    if (this.reconnectAttempts >= 3) {
      this.handlers.onConnection("disconnected");
      this.handlers.onMessage("Automatic reconnect failed. Select Reconnect to try again.");
      return;
    }
    const delay = [1_000, 2_500, 5_000][this.reconnectAttempts++];
    bleDiagnostic("reconnect_scheduled", {
      attempt: this.reconnectAttempts,
      delayMs: delay,
    });
    this.reconnectTimer = window.setTimeout(async () => {
      try {
        await this.connectKnownDevice();
      } catch {
        this.scheduleReconnect();
      }
    }, delay);
  }

  private readonly receivedArgusData = (event: Event) => {
    const value = (event.currentTarget as BluetoothCharacteristic).value;
    if (!value) return;
    const text = decodeBleText(value);
    if (text === null) {
      this.handlers.onMessage("ARGUS received data from the wristband but could not decode the latest reading.");
      return;
    }
    const result = this.packetAssembler.push(text);
    bleDiagnostic("packet_reassembly", {
      byteLength: value.byteLength,
      beginsWith: text.slice(0, 24),
      endsWith: text.slice(-24),
      buffered: result.buffered,
      droppedIncomplete: result.droppedIncomplete,
      completePacketCount: result.packets.length,
      parseError: result.parseError,
    });
    if (result.parseError) {
      this.handlers.onMessage("ARGUS received data from the wristband but could not decode the latest reading.");
    }
    for (const packet of result.packets) {
      void this.handleArgusPacket(packet);
    }
  };

  private async handleArgusPacket(packet: unknown) {
    const identityPacket = parseBleIdentity(packet);
    if (identityPacket) {
      bleDiagnostic("payload_parsed", {
        messageType: "device_info",
        valid: true,
      });
      return;
    }
    const parsed = parseArgusPacket(packet, this.identity?.deviceId);
    if (!parsed) {
      this.handlers.onMessage("ARGUS received data from the wristband but could not decode the latest reading.");
      bleDiagnostic("payload_parsed", {
        messageType: "invalid",
        valid: false,
        reason: "unsupported_telemetry_shape",
      });
      return;
    }
    bleDiagnostic("payload_parsed", {
      messageType: parsed.type,
      valid: true,
    });
    if (parsed.type === "sos") {
      if (this.connectionStage !== "receiving_data") {
        this.setConnectionStage("receiving_data");
      }
      await this.handleSosPacket(parsed.sos);
      return;
    }
    if (this.connectionStage !== "receiving_data") {
      this.setConnectionStage("receiving_data");
    }
    this.handleSensorPacket(parsed.reading);
  }

  private handleSensorPacket(reading: BleReading) {
    if (reading.deviceId !== this.identity?.deviceId) {
      this.handlers.onMessage("The wristband sent invalid or mismatched sensor data.");
      return;
    }
    bleDiagnostic("sensor_notification_parsed", {
      deviceId: reading.deviceId,
      sensorState: reading.sensorState,
    });
    this.handlers.onConnection("receiving_data");
    this.handlers.onReading(reading, false);
    if (reading.sensorState === "valid") {
      this.latestValidReading = reading;
      this.handlers.onMessage("Live MAX30102 data received.");
    } else {
      this.handlers.onMessage(
        `MAX30102 status: ${reading.sensorState.replaceAll("_", " ")}.`,
      );
    }

    const fallTransition = telemetryBooleanTransition(
      this.lastTelemetryFallDetected,
      reading.fallDetected,
    );
    if (fallTransition.activated) {
      bleDiagnostic("fall_state_changed", {
        active: true,
        fallType: reading.fallType,
        capturedAt: reading.capturedAt,
      });
      this.handlers.onMessage(
        `Fall detected${reading.fallType && reading.fallType !== "none" ? `: ${reading.fallType}` : "."}`,
      );
    }
    this.lastTelemetryFallDetected = reading.fallDetected;

    if (reading.sosCountdown && !reading.sosActive) {
      this.handlers.onSosState({
        eventId: `countdown-${reading.deviceId}`,
        status: "countdown",
        message: "The wristband reports that physical SOS activation is counting down.",
      });
    }
    const sosTransition = telemetryBooleanTransition(
      this.lastTelemetrySosActive,
      reading.sosActive,
    );
    const sosStorageKey = `argus-telemetry-sos:${reading.deviceId}`;
    if (sosTransition.activated) {
      let eventId = activeTelemetrySosId(sosStorageKey);
      if (!eventId) {
        eventId = `ble-${crypto.randomUUID()}`;
        storeActiveTelemetrySosId(sosStorageKey, eventId);
      }
      void this.handleSosPacket({
        eventId,
        deviceId: reading.deviceId,
        trekkerId: this.identity?.trekkerId ?? null,
        pressedAt: reading.capturedAt,
        source: "physical_button",
      });
    }
    if (!reading.sosActive) {
      storeActiveTelemetrySosId(sosStorageKey, null);
    }
    this.lastTelemetrySosActive = reading.sosActive;

    if (this.shouldPersistReading(reading)) {
      enqueue({
        id: `${reading.deviceId}-reading-${reading.capturedAt}`,
        kind: "reading",
        path: "/api/trekker/device/readings",
        body: reading,
        createdAt: new Date().toISOString(),
      });
      this.lastReadingPersistedAt = Date.now();
      this.lastPersistedSensorState = reading.sensorState;
      this.lastPersistedTelemetryState = this.telemetryPersistenceState(reading);
      this.handlers.onSyncState(navigator.onLine ? "syncing" : "pending sync");
      void this.flushQueue();
    }
    if (Date.now() - this.latestLocationPersistedAt >= LOCATION_PERSIST_MS) {
      void this.captureLocation(false);
    }
  }

  private shouldPersistReading(reading: BleReading) {
    return (
      reading.sensorState !== this.lastPersistedSensorState ||
      this.telemetryPersistenceState(reading) !== this.lastPersistedTelemetryState ||
      Date.now() - this.lastReadingPersistedAt >= ARGUS_READING_PERSIST_INTERVAL_MS
    );
  }

  private telemetryPersistenceState(reading: BleReading) {
    return [
      reading.amsStatus ?? "",
      reading.fallDetected ? "fall" : "clear",
      reading.fallType ?? "",
      reading.sosCountdown ? "countdown" : "idle",
      reading.sosActive ? "sos" : "clear",
    ].join("|");
  }

  private async handleSosPacket(sos: BleSos) {
    bleDiagnostic("sos_notification_received", {
      deviceId: sos.deviceId,
      eventId: sos.eventId,
    });
    if (sos.deviceId !== this.identity?.deviceId) {
      this.handlers.onMessage("The wristband sent a mismatched SOS event.");
      return;
    }
    if (sos.trekkerId && sos.trekkerId !== this.identity.trekkerId) {
      this.handlers.onMessage("The wristband SOS identity did not match the verified device.");
      return;
    }
    if (this.seenSosIds.has(sos.eventId)) {
      if (readQueue().some((item) => item.id === sos!.eventId)) {
        void this.flushQueue();
      }
      return;
    }
    this.seenSosIds.add(sos.eventId);
    await this.handleSos(sos);
  }

  private async handleSos(sos: BleSos) {
    this.handlers.onSosState({
      eventId: sos.eventId,
      status: navigator.onLine ? "sending" : "queued",
      message: navigator.onLine
        ? "Physical SOS received. Confirming it with ARGUS now."
        : "Physical SOS saved safely on this phone until internet returns.",
    });
    const body: Record<string, unknown> = { ...sos };
    if (this.latestValidReading) body.reading = this.latestValidReading;

    const position = await this.locationForSos();
    body.location = position
      ? {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
          ...(position.coords.altitude == null
            ? {}
            : { altitude: position.coords.altitude }),
          capturedAt: new Date(position.timestamp).toISOString(),
        }
      : null;

    enqueue({
      id: sos.eventId,
      kind: "sos",
      path: "/api/trekker/device/sos",
      body,
      createdAt: new Date().toISOString(),
    });
    if (navigator.onLine) await this.flushQueue();
  }

  private startLocationRefresh() {
    if (this.locationTimer !== null) window.clearInterval(this.locationTimer);
    void this.captureLocation(false);
    this.locationTimer = window.setInterval(() => {
      if (this.latestLocation) {
        this.handlers.onLocation(
          gpsSnapshot(this.latestLocation, this.locationStaleMs),
        );
      }
      if (this.gpsStatus !== "denied") void this.captureLocation(false);
    }, LOCATION_REFRESH_MS);
  }

  private async captureLocation(quick: boolean) {
    if (!navigator.geolocation) {
      this.gpsStatus = "unavailable";
      this.handlers.onLocation({ status: "unavailable" });
      return null;
    }
    this.gpsStatus = "requesting";
    this.handlers.onLocation({
      ...(this.latestLocation
        ? gpsSnapshot(this.latestLocation, this.locationStaleMs)
        : {}),
      status: "requesting",
    });
    try {
      const position = await requestPhoneLocation(quick ? 5_000 : 12_000, quick ? 0 : 5_000);
      this.latestLocation = position;
      this.gpsStatus = "available";
      this.handlers.onLocation(gpsSnapshot(position, this.locationStaleMs));
      if (
        this.identity &&
        Date.now() - this.latestLocationPersistedAt >= LOCATION_PERSIST_MS
      ) {
        const body = locationBody(this.identity.deviceId, position);
        enqueue({
          id: `${this.identity.deviceId}-location-${position.timestamp}`,
          kind: "location",
          path: "/api/trekker/device/location",
          body,
          createdAt: new Date().toISOString(),
        });
        this.handlers.onSyncState(navigator.onLine ? "syncing" : "pending sync");
        this.latestLocationPersistedAt = Date.now();
        void this.flushQueue();
      }
      return position;
    } catch (error) {
      const denied =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        Number((error as { code?: unknown }).code) === 1;
      this.gpsStatus = denied ? "denied" : "unavailable";
      this.handlers.onLocation({
        ...(this.latestLocation
          ? gpsSnapshot(this.latestLocation, this.locationStaleMs)
          : {}),
        status: this.gpsStatus,
      });
      return null;
    }
  }

  private async locationForSos() {
    const refreshed = await this.captureLocation(true);
    return refreshed ?? this.latestLocation;
  }

  private async flushQueue() {
    if (!navigator.onLine) return;
    if (this.flushPromise) return this.flushPromise;
    this.flushPromise = this.performFlush();
    try {
      await this.flushPromise;
    } finally {
      this.flushPromise = null;
    }
  }

  private async performFlush() {
    for (const item of prioritizeBridgeQueue(readQueue())) {
      try {
        const data = await sendQueued(item);
        bleDiagnostic("backend_persistence", {
          kind: item.kind,
          id: item.id,
          duplicate: data.duplicate ?? false,
          databaseStatus: data.databaseStatus ?? null,
        });
        writeQueue(readQueue().filter((queued) => queued.id !== item.id));
        if (item.kind === "reading") {
          const reading = item.body as BleReading;
          this.handlers.onReading(reading, true);
        }
        if (item.kind === "reading" || item.kind === "location") {
          this.handlers.onSyncState("synced");
          this.handlers.onSyncError(null);
        }
        if (item.kind === "sos") {
          this.handlers.onSosState({
            eventId: item.id,
            status: "confirmed",
            message: data.duplicate
              ? "This SOS was already recorded; no duplicate alert was sent."
              : "SOS recorded and the responder workflow was started.",
            trackingId: data.event?.id,
            notificationStatus: data.event?.notificationStatus ?? "pending",
            duplicate: data.duplicate,
          });
        }
      } catch (error) {
        if (item.kind === "reading" || item.kind === "location") {
          this.handlers.onSyncState(navigator.onLine ? "failed" : "syncing");
          this.handlers.onSyncError(
            error instanceof Error ? error.message : "Database synchronization failed.",
          );
        }
        if (item.kind === "sos") {
          this.handlers.onSosState({
            eventId: item.id,
            status: "failed",
            message:
              error instanceof Error
                ? `${error.message} The same SOS event can be retried safely.`
                : "SOS confirmation failed. The same event can be retried safely.",
          });
        }
        return;
      }
    }
  }
}
