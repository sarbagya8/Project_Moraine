import {
  ARGUS_BLE,
  ARGUS_SENSOR_STATES,
  type ArgusSensorState,
} from "./bluetooth/argus-ble-config";

export const ARGUS_BLE_SERVICE = ARGUS_BLE.service;
const QUEUE_KEY = "argus-ble-bridge-v2";
const MAX_QUEUE_ITEMS = 24;

export type BleIdentity = {
  deviceId: string;
  trekkerId: string;
  firmwareVersion: string;
};

export type BleReading = {
  deviceId: string;
  trekkerId: string;
  heartRate: number | null;
  spo2: number | null;
  temperature: number | null;
  capturedAt: string;
  sensorState: ArgusSensorState;
};

export type BleSos = {
  eventId: string;
  deviceId: string;
  trekkerId: string;
  pressedAt: string;
  source: "physical_button";
};

type QueueItem = {
  id: string;
  kind: "reading" | "location" | "sos";
  path: string;
  body: Record<string, unknown>;
  createdAt: string;
};

type BluetoothCharacteristic = EventTarget & {
  value?: DataView;
  readValue(): Promise<DataView>;
  startNotifications(): Promise<BluetoothCharacteristic>;
  stopNotifications?(): Promise<BluetoothCharacteristic>;
};
type BluetoothService = { getCharacteristic(uuid: string): Promise<BluetoothCharacteristic> };
type BluetoothServer = {
  connected: boolean;
  connect(): Promise<BluetoothServer>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<BluetoothService>;
};
type BluetoothDevice = EventTarget & { id?: string; name?: string; gatt?: BluetoothServer };
type BluetoothApi = { requestDevice(options: { filters: Array<{ services: string[] }> }): Promise<BluetoothDevice> };

export type BleBridgeStatus =
  | "unsupported_browser"
  | "insecure_context"
  | "ready"
  | "connecting"
  | "connected"
  | "receiving_data"
  | "disconnected"
  | "permission_denied"
  | "device_mismatch";

export type BleBridgeHandlers = {
  onConnection(status: BleBridgeStatus): void;
  onMessage(message: string): void;
  onIdentity(identity: BleIdentity | null): void;
  onReading(reading: BleReading, synced: boolean): void;
  onAuthoritiesAlerted(eventId: string, notificationStatus: string): void;
};

export function detectBleEnvironment(hasBluetooth: boolean, secureContext: boolean): BleBridgeStatus {
  if (!hasBluetooth) return "unsupported_browser";
  if (!secureContext) return "insecure_context";
  return "ready";
}

function bluetoothApi() {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { bluetooth?: BluetoothApi }).bluetooth;
}

function decodeJson(value: DataView): unknown {
  return JSON.parse(new TextDecoder().decode(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shortString(value: unknown, max = 100) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max
    ? value.trim()
    : null;
}

export function parseBleIdentity(value: unknown): BleIdentity | null {
  if (!isRecord(value)) return null;
  const deviceId = shortString(value.deviceId);
  const trekkerId = shortString(value.trekkerId);
  const firmwareVersion = shortString(value.firmwareVersion, 40);
  return deviceId && trekkerId && firmwareVersion ? { deviceId, trekkerId, firmwareVersion } : null;
}

export function parseBleReading(value: unknown): BleReading | null {
  if (!isRecord(value)) return null;
  const deviceId = shortString(value.deviceId);
  const trekkerId = shortString(value.trekkerId);
  const capturedAt = typeof value.capturedAt === "number" && Number.isFinite(value.capturedAt)
    ? new Date().toISOString()
    : shortString(value.capturedAt, 40);
  const sensorState = typeof value.sensorState === "string" && ARGUS_SENSOR_STATES.includes(value.sensorState as ArgusSensorState)
    ? value.sensorState as ArgusSensorState
    : null;
  if (!deviceId || !trekkerId || !capturedAt || !sensorState || !Number.isFinite(Date.parse(capturedAt))) return null;
  const nullableNumber = (candidate: unknown) => candidate === null ? null : typeof candidate === "number" && Number.isFinite(candidate) ? candidate : undefined;
  const heartRate = nullableNumber(value.heartRate);
  const spo2 = nullableNumber(value.spo2);
  const temperature = nullableNumber(value.temperature);
  if (heartRate === undefined || spo2 === undefined || temperature === undefined) return null;
  if (sensorState === "valid") {
    if (heartRate === null || spo2 === null || heartRate < 20 || heartRate > 240 || spo2 < 50 || spo2 > 100) return null;
  } else if (heartRate !== null || spo2 !== null) return null;
  return { deviceId, trekkerId, heartRate, spo2, temperature, capturedAt, sensorState };
}

export function parseBleSos(value: unknown): BleSos | null {
  if (!isRecord(value)) return null;
  const eventId = shortString(value.eventId);
  const deviceId = shortString(value.deviceId);
  const trekkerId = shortString(value.trekkerId);
  const pressedAt = typeof value.pressedAt === "number" && Number.isFinite(value.pressedAt)
    ? new Date().toISOString()
    : shortString(value.pressedAt, 40);
  if (!eventId || !/^[A-Za-z0-9._:-]+$/.test(eventId) || !deviceId || !trekkerId || !pressedAt || !Number.isFinite(Date.parse(pressedAt)) || value.source !== "physical_button") return null;
  return { eventId, deviceId, trekkerId, pressedAt, source: "physical_button" };
}

function readQueue(): QueueItem[] {
  try {
    const value = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]") as unknown;
    return Array.isArray(value) ? value.filter(isRecord) as QueueItem[] : [];
  } catch { return []; }
}

function writeQueue(items: QueueItem[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(0, MAX_QUEUE_ITEMS)));
}

export function prioritizeBridgeQueue(items: QueueItem[]) {
  return [...items].sort((a, b) => a.kind === b.kind ? a.createdAt.localeCompare(b.createdAt) : a.kind === "sos" ? -1 : b.kind === "sos" ? 1 : a.createdAt.localeCompare(b.createdAt));
}

function enqueue(item: QueueItem) {
  writeQueue(prioritizeBridgeQueue([item, ...readQueue().filter((queued) => queued.id !== item.id)]));
}

async function requestPhoneLocation() {
  if (!navigator.geolocation) throw new Error("Phone GPS is unavailable.");
  return new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 12_000, maximumAge: 5_000 }));
}

function locationBody(identity: Pick<BleIdentity, "deviceId" | "trekkerId">, position: GeolocationPosition) {
  return { ...identity, latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMeters: position.coords.accuracy, altitude: position.coords.altitude ?? undefined, capturedAt: new Date(position.timestamp).toISOString() };
}

async function sendQueued(item: QueueItem) {
  const response = await fetch(item.path, { method: "POST", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json", "x-idempotency-key": item.id }, body: JSON.stringify(item.body) });
  if (!response.ok) throw new Error(`Bridge request failed with HTTP ${response.status}.`);
  return response.json() as Promise<{ data?: { notificationStatus?: string; event?: { notificationStatus?: string } } }>;
}

export class TrekkerBleBridge {
  private device: BluetoothDevice | null = null;
  private sensorCharacteristic: BluetoothCharacteristic | null = null;
  private sosCharacteristic: BluetoothCharacteristic | null = null;
  private identity: BleIdentity | null = null;
  private latestValidReading: BleReading | null = null;
  private readonly online = () => void this.flushQueue();

  constructor(private readonly expected: Pick<BleIdentity, "deviceId" | "trekkerId">, private readonly handlers: BleBridgeHandlers) {}

  environmentStatus(): BleBridgeStatus {
    return detectBleEnvironment(Boolean(bluetoothApi()), window.isSecureContext);
  }

  async connect() {
    const environment = this.environmentStatus();
    if (environment !== "ready") {
      this.handlers.onConnection(environment);
      this.handlers.onMessage(environment === "insecure_context" ? "Web Bluetooth requires localhost or HTTPS." : "Use Chrome or Edge on localhost or HTTPS, enable Bluetooth, and keep the ARGUS wristband nearby.");
      return;
    }
    this.handlers.onConnection("connecting");
    try {
      this.device = await bluetoothApi()!.requestDevice({ filters: [{ services: [ARGUS_BLE.service] }] });
      this.device.addEventListener("gattserverdisconnected", this.disconnected);
      const server = await this.device.gatt?.connect();
      if (!server) throw new Error("Bluetooth is unavailable or the wristband could not be reached.");
      const service = await server.getPrimaryService(ARGUS_BLE.service);
      const identity = parseBleIdentity(decodeJson(await (await service.getCharacteristic(ARGUS_BLE.deviceInfo)).readValue()));
      if (!identity) throw new Error("The wristband returned an invalid device identity.");
      const verification = await fetch("/api/trekker/device/verify", { method: "POST", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(identity) });
      if (!verification.ok) {
        this.handlers.onConnection("device_mismatch");
        server.disconnect();
        throw new Error("This wristband is unknown, unassigned, or assigned to another trekker.");
      }
      this.identity = identity;
      this.handlers.onIdentity(identity);
      this.sensorCharacteristic = await service.getCharacteristic(ARGUS_BLE.liveSensor);
      this.sosCharacteristic = await service.getCharacteristic(ARGUS_BLE.sosEvent);
      this.sensorCharacteristic.addEventListener("characteristicvaluechanged", this.receivedSensor);
      this.sosCharacteristic.addEventListener("characteristicvaluechanged", this.receivedSos);
      await this.sensorCharacteristic.startNotifications();
      await this.sosCharacteristic.startNotifications();
      window.addEventListener("online", this.online);
      this.handlers.onConnection("connected");
      this.handlers.onMessage("Wristband verified. Waiting for MAX30102 data.");
      await this.flushQueue();
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") {
        this.handlers.onConnection("permission_denied");
        this.handlers.onMessage("Bluetooth permission was denied or no ARGUS wristband was selected.");
      } else {
        if (this.environmentStatus() === "ready" && !this.identity) this.handlers.onConnection("disconnected");
        this.handlers.onMessage(error instanceof Error ? error.message : "BLE connection failed.");
      }
      this.cleanup(false);
    }
  }

  disconnect() {
    this.cleanup(true);
    this.handlers.onConnection("disconnected");
    this.handlers.onMessage("Wristband disconnected. Stored data is now stale.");
  }

  private cleanup(disconnectGatt: boolean) {
    window.removeEventListener("online", this.online);
    this.sensorCharacteristic?.removeEventListener("characteristicvaluechanged", this.receivedSensor);
    this.sosCharacteristic?.removeEventListener("characteristicvaluechanged", this.receivedSos);
    if (disconnectGatt && this.device?.gatt?.connected) this.device.gatt.disconnect();
    this.device?.removeEventListener("gattserverdisconnected", this.disconnected);
    this.sensorCharacteristic = null;
    this.sosCharacteristic = null;
    this.device = null;
    this.identity = null;
    this.handlers.onIdentity(null);
  }

  private readonly disconnected = () => {
    this.cleanup(false);
    this.handlers.onConnection("disconnected");
    this.handlers.onMessage("Wristband disconnected. Select Reconnect to resume live monitoring.");
  };

  private readonly receivedSensor = (event: Event) => {
    const value = (event.currentTarget as BluetoothCharacteristic).value;
    if (!value) return;
    const reading = parseBleReading(decodeJson(value));
    if (!reading || !this.matches(reading)) {
      this.handlers.onMessage("The wristband sent invalid or mismatched sensor data.");
      return;
    }
    this.handlers.onConnection("receiving_data");
    this.handlers.onReading(reading, false);
    if (reading.sensorState !== "valid") {
      this.handlers.onMessage(`MAX30102 status: ${reading.sensorState.replaceAll("_", " ")}.`);
      return;
    }
    this.latestValidReading = reading;
    enqueue({ id: `${reading.deviceId}-reading-${reading.capturedAt}`, kind: "reading", path: "/api/trekker/device/readings", body: { ...reading, sensorState: undefined }, createdAt: new Date().toISOString() });
    void this.captureLocation(reading);
    void this.flushQueue();
  };

  private readonly receivedSos = (event: Event) => {
    const value = (event.currentTarget as BluetoothCharacteristic).value;
    if (!value) return;
    const sos = parseBleSos(decodeJson(value));
    if (!sos || !this.matches(sos)) {
      this.handlers.onMessage("The wristband sent an invalid or mismatched SOS event.");
      return;
    }
    void this.handleSos(sos);
  };

  private matches(value: { deviceId: string; trekkerId: string }) {
    return value.deviceId === this.expected.deviceId && value.trekkerId === this.expected.trekkerId && value.deviceId === this.identity?.deviceId;
  }

  private async captureLocation(identity: Pick<BleIdentity, "deviceId" | "trekkerId">) {
    try {
      const position = await requestPhoneLocation();
      enqueue({ id: `${identity.deviceId}-location-${position.timestamp}`, kind: "location", path: "/api/trekker/device/location", body: locationBody(identity, position), createdAt: new Date().toISOString() });
      this.handlers.onMessage("Live from MAX30102. Phone GPS captured; syncing.");
    } catch {
      this.handlers.onMessage("Live from MAX30102. Phone GPS is denied or unavailable.");
    }
  }

  private async handleSos(sos: BleSos) {
    const body: Record<string, unknown> = { ...sos };
    if (this.latestValidReading) body.reading = { ...this.latestValidReading, sensorState: undefined };
    try { body.location = locationBody(sos, await requestPhoneLocation()); }
    catch { this.handlers.onMessage("SOS created locally; phone GPS is denied or unavailable."); }
    enqueue({ id: sos.eventId, kind: "sos", path: "/api/trekker/device/sos", body, createdAt: new Date().toISOString() });
    if (!navigator.onLine) {
      this.handlers.onMessage("SOS saved locally, waiting for internet.");
      return;
    }
    this.handlers.onMessage("SOS created. Notification pending.");
    await this.flushQueue();
  }

  private async flushQueue() {
    if (!navigator.onLine) return;
    for (const item of prioritizeBridgeQueue(readQueue())) {
      try {
        const result = await sendQueued(item);
        writeQueue(readQueue().filter((queued) => queued.id !== item.id));
        if (item.kind === "reading" && this.latestValidReading) this.handlers.onReading(this.latestValidReading, true);
        if (item.kind === "sos") this.handlers.onAuthoritiesAlerted(item.id, result.data?.event?.notificationStatus ?? result.data?.notificationStatus ?? "pending");
      } catch { return; }
    }
  }
}
