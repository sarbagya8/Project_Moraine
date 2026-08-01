"use client";

import { useEffect, useRef, useState } from "react";
import { StatusBadge } from "@/components/shared/portal-ui";
import { TrekkerBleBridge, type BleBridgeStatus, type BleIdentity, type BleReading } from "@/lib/trekker-ble";

export function DeviceConnectionPanel({ trekkerId, deviceId }: { trekkerId: string; deviceId: string | null }) {
  const bridge = useRef<TrekkerBleBridge | null>(null);
  const [status, setStatus] = useState<BleBridgeStatus>("ready");
  const [message, setMessage] = useState(deviceId ? "Ready to connect the assigned ARGUS wristband." : "No wristband is assigned to this trekker.");
  const [reading, setReading] = useState<BleReading | null>(null);
  const [identity, setIdentity] = useState<BleIdentity | null>(null);
  const [syncState, setSyncState] = useState("unsynced");

  useEffect(() => () => bridge.current?.disconnect(), []);

  async function connect() {
    if (!deviceId || status === "connecting") return;
    bridge.current?.disconnect();
    const connection = new TrekkerBleBridge(
      { trekkerId, deviceId },
      {
        onConnection: setStatus,
        onMessage: setMessage,
        onIdentity: setIdentity,
        onReading: (value, synced) => {
          setReading(value);
          setSyncState(synced ? "synced" : navigator.onLine ? "syncing" : "saved locally");
        },
        onAuthoritiesAlerted: (eventId, notificationStatus) => setMessage(`SOS confirmed by ARGUS. Event ${eventId}. Notification ${notificationStatus}.`),
      },
    );
    bridge.current = connection;
    await connection.connect();
  }

  function disconnect() {
    bridge.current?.disconnect();
    bridge.current = null;
    setIdentity(null);
  }

  const connected = status === "connected" || status === "receiving_data";
  const tone = connected ? "green" : status === "device_mismatch" || status === "permission_denied" ? "red" : undefined;

  return (
    <section className="panel device-connection-panel" aria-labelledby="device-connection-title">
      <div className="section-heading">
        <div><p className="eyebrow">Wristband connection</p><h2 id="device-connection-title">ARGUS BLE sensor</h2></div>
        <StatusBadge value={status.replaceAll("_", " ")} tone={tone} />
      </div>
      <p className="muted">{deviceId ? `Assigned device: ${deviceId}` : "Ask the authority team to assign a device first."}</p>
      <dl className="compact-details">
        <div><dt>Connected device</dt><dd>{identity?.deviceId ?? "None"}</dd></div>
        <div><dt>Firmware</dt><dd>{identity?.firmwareVersion ?? "Unavailable"}</dd></div>
        <div><dt>Sensor status</dt><dd>{reading?.sensorState.replaceAll("_", " ") ?? "unavailable"}</dd></div>
        <div><dt>Last BLE update</dt><dd>{reading ? new Date(reading.capturedAt).toLocaleTimeString() : "Unavailable"}</dd></div>
        <div><dt>Cloud sync</dt><dd>{syncState}</dd></div>
      </dl>
      <p className="form-message" aria-live="polite">{message}</p>
      {reading ? (
        <div className="ble-reading-grid" aria-label="Latest BLE reading">
          <span><strong>{reading.heartRate ?? "Unavailable"}</strong>{reading.heartRate == null ? "" : " bpm"}</span>
          <span><strong>{reading.spo2 ?? "Unavailable"}</strong>{reading.spo2 == null ? "" : "% SpO₂"}</span>
          <span><strong>{reading.temperature ?? "Unavailable"}</strong>{reading.temperature == null ? "" : " °C"}</span>
          <span><strong>{reading.sensorState === "valid" ? "Live from MAX30102" : "Not a valid reading"}</strong></span>
        </div>
      ) : null}
      <div className="button-row">
        {connected ? (
          <button className="secondary-button" type="button" onClick={disconnect}>Disconnect</button>
        ) : (
          <button className="primary-button" type="button" disabled={!deviceId || status === "connecting"} onClick={() => void connect()}>
            {status === "connecting" ? "Connecting…" : status === "disconnected" ? "Reconnect" : "Connect wristband"}
          </button>
        )}
      </div>
      <p className="muted">Use Chrome or Edge on localhost or HTTPS, enable Bluetooth, and keep the ARGUS wristband nearby.</p>
    </section>
  );
}
