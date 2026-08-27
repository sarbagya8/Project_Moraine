"use client";

import { useEffect, useRef, useState } from "react";
import { StatusBadge, displayDeviceId, formatTime, relativeAge } from "@/components/shared/portal-ui";
import {
  ARGUS_SENSOR_STALE_MS,
  TrekkerBleBridge,
  detectBleEnvironment,
  type BleBridgeStatus,
  type BleConnectionStage,
  type BleDiscoveryMode,
  type BleIdentity,
  type BleReading,
  type GpsSnapshot,
  type SosDeliveryState,
} from "@/lib/trekker-ble";

const connectionStageLabels: Record<BleConnectionStage, string> = {
  idle: "Ready",
  chooser_opened: "Opening Bluetooth chooser",
  device_selected: "Device selected",
  gatt_connecting: "Connecting to GATT",
  gatt_connected: "GATT connected",
  service_found: "MORAINE service found",
  characteristic_found: "MORAINE characteristic found",
  identity_read: "Device identity read",
  device_verified: "Device verified",
  notifications_started: "Notifications started",
  receiving_data: "Receiving data",
  disconnected: "Disconnected",
  connection_failed: "Connection failed",
};

export function DeviceConnectionPanel({
  deviceId,
  displayName,
  locationStaleSeconds,
  onStoredData,
}: {
  deviceId: string | null;
  displayName?: string | null;
  locationStaleSeconds: number;
  onStoredData?: () => void;
}) {
  const bridge = useRef<TrekkerBleBridge | null>(null);
  const connectInFlight = useRef(false);
  const [status, setStatus] = useState<BleBridgeStatus>("ready");
  const [connectionStage, setConnectionStage] =
    useState<BleConnectionStage>("idle");
  const [diagnosticFallbackAvailable, setDiagnosticFallbackAvailable] =
    useState(false);
  const [message, setMessage] = useState(
    deviceId
      ? "Ready to connect the assigned MORAINE safety device."
      : "No safety device is assigned to this trekker.",
  );
  const [reading, setReading] = useState<BleReading | null>(null);
  const [readingReceivedAt, setReadingReceivedAt] = useState<number | null>(null);
  const [identity, setIdentity] = useState<BleIdentity | null>(null);
  const [syncState, setSyncState] = useState("not started");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [gps, setGps] = useState<GpsSnapshot>({
    status: "permission_not_requested",
  });
  const [sos, setSos] = useState<SosDeliveryState | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const hasBluetooth =
      typeof navigator !== "undefined" && "bluetooth" in navigator;
    const initial = window.setTimeout(() => {
      setStatus(detectBleEnvironment(hasBluetooth, window.isSecureContext));
      setNow(Date.now());
    }, 0);
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      bridge.current?.destroy();
      bridge.current = null;
    };
  }, []);

  async function connect(mode: BleDiscoveryMode = "service") {
    if (!deviceId || status === "connecting" || connectInFlight.current) return;
    connectInFlight.current = true;
    try {
      bridge.current?.destroy();
      const connection = new TrekkerBleBridge(
        { deviceId },
        {
          onConnection: setStatus,
          onStage: setConnectionStage,
          onDiagnosticFallbackAvailable: setDiagnosticFallbackAvailable,
          onMessage: setMessage,
          onIdentity: setIdentity,
          onReading: (value, synced) => {
            setReading(value);
            if (!synced) setReadingReceivedAt(Date.now());
            if (synced) onStoredData?.();
          },
          onSyncState: setSyncState,
          onSyncError: setSyncError,
          onLocation: setGps,
          onSosState: setSos,
        },
      locationStaleSeconds * 1_000,
      );
      bridge.current = connection;
      await connection.connect(mode);
    } finally {
      connectInFlight.current = false;
    }
  }

  function disconnect() {
    bridge.current?.disconnect();
    bridge.current = null;
    setIdentity(null);
  }

  const connected = ["connected", "receiving_data", "reconnecting"].includes(status);
  const readingIsStale =
    readingReceivedAt === null || (now > 0 && now - readingReceivedAt > ARGUS_SENSOR_STALE_MS);
  const gpsIsStale =
    gps.capturedAt != null &&
    now > 0 && now - Date.parse(gps.capturedAt) > locationStaleSeconds * 1_000;
  const gpsDisplayStatus = gpsIsStale ? "stale" : gps.status;
  const sensorDisplayState = !reading
    ? "unavailable"
    : readingIsStale
      ? "stale"
      : reading.sensorState;
  const tone =
    connected && status !== "reconnecting"
      ? "green"
      : ["device_mismatch", "permission_denied"].includes(status)
        ? "red"
        : undefined;
  const gpsDetail =
    gps.latitude == null || gps.longitude == null
      ? "No coordinates available"
      : `${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)} · ±${Math.round(gps.accuracyMeters ?? 0)} m`;

  return (
    <section className="panel device-connection-panel" aria-labelledby="device-connection-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Expedition safety device</p>
          <h2 id="device-connection-title">Connect device</h2>
        </div>
        <StatusBadge value={status.replaceAll("_", " ")} tone={tone} />
      </div>

      <p className="muted">
        {deviceId
          ? `Assigned safety device: ${displayName || displayDeviceId(deviceId)}`
          : "Ask the response team to assign a safety device first."}
      </p>
      <dl className="compact-details">
        <div><dt>Connection</dt><dd>{connectionStageLabels[connectionStage]}</dd></div>
        <div><dt>Sensor state</dt><dd><StatusBadge value={sensorDisplayState.replaceAll("_", " ")} tone={sensorDisplayState === "valid" ? "green" : sensorDisplayState === "sensor_error" ? "red" : undefined} /></dd></div>
        <div><dt>Last packet</dt><dd>{reading?.capturedAt ? formatTime(reading.capturedAt) : "No reading yet"}</dd></div>
        <div><dt>Database sync</dt><dd><StatusBadge value={syncState} /></dd></div>
        <div><dt>Phone GPS</dt><dd><StatusBadge value={gpsDisplayStatus.replaceAll("_", " ")} tone={gpsDisplayStatus === "available" ? "green" : gpsDisplayStatus === "denied" ? "red" : undefined} /></dd></div>
      </dl>
      <details className="technical-details">
        <summary>Technical details</summary>
        <dl className="compact-details">
          <div><dt>Browser support</dt><dd>{status === "unsupported_browser" ? "Unsupported" : "Web Bluetooth available"}</dd></div>
          <div><dt>Secure context</dt><dd>{typeof window !== "undefined" && window.isSecureContext ? "HTTPS / localhost" : "HTTPS required"}</dd></div>
          <div><dt>Device name</dt><dd>{identity?.deviceName ?? "Unavailable"}</dd></div>
          <div><dt>Verified device</dt><dd>{identity?.deviceId ? displayDeviceId(identity.deviceId) : "Not connected"}</dd></div>
          <div><dt>Firmware</dt><dd>{identity?.firmwareVersion ?? "Unavailable"}</dd></div>
          <div><dt>Identity source</dt><dd>{identity ? (identity.identitySource === "firmware" ? "ESP32 firmware" : "Assigned device record") : "Unavailable"}</dd></div>
          <div><dt>Last live reading</dt><dd>{readingReceivedAt ? relativeAge(new Date(readingReceivedAt).toISOString()) : "Unavailable"}</dd></div>
          <div><dt>GPS fix</dt><dd>{gpsDetail}</dd></div>
          <div><dt>GPS captured</dt><dd>{gps.capturedAt ? relativeAge(gps.capturedAt) : "Unavailable"}</dd></div>
          {syncError ? <div><dt>Sync error</dt><dd>{syncError}</dd></div> : null}
        </dl>
      </details>

      <p className="form-message" aria-live="polite">{message}</p>
      {reading ? (
        <div className="ble-reading-grid" aria-label="Latest BLE reading">
          <span><strong>{reading.heartRate ?? "Unavailable"}</strong>{reading.heartRate == null ? "" : " bpm"}</span>
          <span><strong>{reading.spo2 ?? "Unavailable"}</strong>{reading.spo2 == null ? "" : "% SpO₂"}</span>
          <span><strong>{reading.temperature ?? "Unavailable"}</strong>{reading.temperature == null ? "" : " °C ambient"}</span>
          <span><strong>{reading.altitude ?? "Unavailable"}</strong>{reading.altitude == null ? "" : " m barometric"}</span>
          <span><strong>{reading.pressure ?? "Unavailable"}</strong>{reading.pressure == null ? "" : " hPa pressure"}</span>
          <span><strong>{reading.averageSpeed ?? "Unavailable"}</strong>{reading.averageSpeed == null ? "" : " m/s average"}</span>
          <span><strong>{reading.distance ?? "Unavailable"}</strong>{reading.distance == null ? "" : " m distance"}</span>
          <span><strong>{reading.amsStatus ?? "Unavailable"}</strong> AMS status</span>
          <span><strong>{reading.fallDetected ? "Detected" : "Clear"}</strong>{reading.fallDetected && reading.fallType ? ` · ${reading.fallType}` : " fall state"}</span>
          <span><strong>{reading.sosCountdown ? "Active" : "Inactive"}</strong> SOS countdown</span>
          <span><strong>{reading.sosActive ? "Active" : "Inactive"}</strong> physical SOS</span>
        </div>
      ) : null}

      {sos ? (
        <div className={`inline-warning sos-delivery sos-${sos.status}`} role="status" aria-live="assertive">
          <strong>Physical SOS: {sos.status}</strong>
          <p>{sos.message}</p>
          <dl className="compact-details">
            <div><dt>Hardware event ID</dt><dd>{sos.eventId}</dd></div>
            {sos.trackingId ? <div><dt>Tracking ID</dt><dd>{sos.trackingId}</dd></div> : null}
            {sos.notificationStatus ? <div><dt>WhatsApp</dt><dd>{sos.notificationStatus}</dd></div> : null}
          </dl>
          {sos.status === "failed" ? (
            <button className="danger-button" type="button" onClick={() => void bridge.current?.retrySos(sos.eventId)}>
              Retry same SOS event
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="button-row">
        {connected ? (
          <button className="secondary-button" type="button" onClick={disconnect}>Disconnect</button>
        ) : (
          <button className="primary-button" type="button" disabled={!deviceId || status === "connecting"} onClick={() => void connect()}>
            {status === "connecting" ? "Connecting…" : status === "disconnected" ? "Reconnect safety device" : "Connect safety device"}
          </button>
        )}
        {!connected && diagnosticFallbackAvailable ? (
          <button
            className="secondary-button"
            type="button"
            disabled={!deviceId || status === "connecting"}
            onClick={() => void connect("diagnostic_all_devices")}
          >
            Search all Bluetooth devices (diagnostic)
          </button>
        ) : null}
      </div>
      {diagnosticFallbackAvailable ? (
        <p className="muted">
          Use the diagnostic chooser only if the wristband did not appear in the
          service-filtered chooser. MORAINE will still reject devices without the
          required service, characteristics, identity, and server assignment.
        </p>
      ) : null}
      <p className="muted">
        Use Chrome or Edge on localhost or HTTPS. Windows pre-pairing is not
        required. Before connecting, disconnect the wristband from mobile BLE
        apps or another phone, then select its actual advertised name.
      </p>
    </section>
  );
}
