type StatusPillProps = { label: string; tone?: "green" | "amber" | "red" | "sage" };

export function StatusPill({ label, tone = "sage" }: StatusPillProps) {
  return <span className={`land-status land-status-${tone}`}>{label}</span>;
}

export function DevicePreview() {
  return (
    <div className="land-device" aria-label="ARGUS wristband illustration">
      <div className="land-device-body" aria-hidden="true">
        <span className="land-device-face" />
        <span className="land-device-sensor" />
        <span className="land-device-button" />
        <span className="land-device-strap land-device-strap-a" />
        <span className="land-device-strap land-device-strap-b" />
      </div>
      <div className="land-device-note">
        <p className="land-mini-eyebrow">ESP32 · MAX30102</p>
        <strong>ARGUS wristband</strong>
        <div className="land-inline-status">
          <StatusPill label="Live from MAX30102" tone="green" />
        </div>
      </div>
    </div>
  );
}

export function PhonePreview() {
  return (
    <div className="land-phone" aria-label="Trekker portal on phone illustration">
      <div className="land-phone-bar" aria-hidden="true" />
      <div className="land-phone-head">
        <div>
          <p className="land-mini-eyebrow">Trekker portal · demo</p>
          <strong>Welcome, Sarbagya</strong>
        </div>
        <StatusPill label="Monitoring" tone="green" />
      </div>
      <div className="land-phone-device">
        <div>
          <span className="land-mini-eyebrow">Assigned device</span>
          <strong>ARGUS-ESP32-DEMO-01</strong>
        </div>
        <StatusPill label="BLE connected" tone="green" />
      </div>
      <div className="land-phone-map" aria-hidden="true">
        <span className="land-map-peak land-map-peak-a" />
        <span className="land-map-peak land-map-peak-b" />
        <span className="land-map-peak land-map-peak-c" />
        <span className="land-map-route" />
        <span className="land-map-pin" />
      </div>
      <div className="land-phone-map-meta">
        28.4572° N, 83.9546° E · ±10 m · 1 s ago
      </div>
      <div className="land-phone-vitals">
        <div>
          <span className="land-mini-eyebrow">Heart rate</span>
          <strong className="land-vital-value">88 bpm</strong>
        </div>
        <div>
          <span className="land-mini-eyebrow">SpO₂</span>
          <strong className="land-vital-value">97%</strong>
        </div>
        <div>
          <span className="land-mini-eyebrow">Sensor</span>
          <strong className="land-vital-value">Live</strong>
        </div>
      </div>
      <div className="land-phone-row">
        <span>GPS accuracy</span>
        <strong>±10 m</strong>
      </div>
      <div className="land-phone-ready">
        <span aria-hidden="true" />
        SOS ready
      </div>
    </div>
  );
}

const flowStates = [
  { label: "Created", tone: "green" as const },
  { label: "Pending", tone: "amber" as const },
  { label: "Accepted", tone: "amber" as const },
  { label: "Sent", tone: "amber" as const },
  { label: "Delivered", tone: "green" as const },
];

export function EmergencyPreview() {
  return (
    <div className="land-emergency" aria-label="SOS event flow illustration">
      <div className="land-emergency-head">
        <div>
          <p className="land-mini-eyebrow">SOS event · demo</p>
          <strong>One record from wristband to rescue</strong>
        </div>
        <StatusPill label="Active" tone="red" />
      </div>
      <div className="land-emergency-snapshot">
        <div>
          <span className="land-mini-eyebrow">Heart rate</span>
          <strong>88 bpm</strong>
        </div>
        <div>
          <span className="land-mini-eyebrow">SpO₂</span>
          <strong>97%</strong>
        </div>
        <div>
          <span className="land-mini-eyebrow">GPS</span>
          <strong>±10 m</strong>
        </div>
      </div>
      <ol className="land-emergency-steps">
        {flowStates.map((state) => (
          <li key={state.label}>
            <StatusPill label={state.label} tone={state.tone} />
          </li>
        ))}
      </ol>
      <div className="land-emergency-delivery">
        <span aria-hidden="true" />
        <div>
          <strong>WhatsApp alert to trusted contacts</strong>
          <p>Map + Rescue Passport · Meta Cloud API</p>
        </div>
        <StatusPill label="Accepted" tone="amber" />
      </div>
      <p className="land-illustrative-note">
        Illustrative sequence · delivery shown only when provider confirms it
      </p>
    </div>
  );
}

export function AuthorityPreview() {
  return (
    <div className="land-authority" aria-label="Authority portal preview">
      <div className="land-authority-head">
        <div>
          <p className="land-mini-eyebrow">Authority / Rescue · demo</p>
          <strong>Active emergencies</strong>
        </div>
        <StatusPill label="2 active" tone="red" />
      </div>
      <div className="land-authority-cards">
        <div>
          <span className="land-mini-eyebrow">SOS events</span>
          <strong>2</strong>
        </div>
        <div>
          <span className="land-mini-eyebrow">Devices online</span>
          <strong>7</strong>
        </div>
        <div>
          <span className="land-mini-eyebrow">Freshness</span>
          <strong>1 s</strong>
        </div>
      </div>
      <div className="land-authority-rows">
        <div className="land-authority-row">
          <div>
            <strong>Sarbagya Acharya</strong>
            <p>TRK-DEMO-001 · Mardi Himal Trek</p>
          </div>
          <div className="land-authority-row-values">
            <span><b>88</b> bpm</span>
            <span><b>97</b> % SpO₂</span>
            <span className="land-gps"></span>
          </div>
          <StatusPill label="Active" tone="red" />
        </div>
        <div className="land-authority-row">
          <div>
            <strong>Anisha Rai</strong>
            <p>TRK-0142 · Annapurna Base Camp</p>
          </div>
          <div className="land-authority-row-values">
            <span><b>92</b> bpm</span>
            <span><b>95</b> % SpO₂</span>
            <span className="land-gps"></span>
          </div>
          <StatusPill label="Acknowledged" tone="amber" />
        </div>
      </div>
      <p className="land-illustrative-note">
        Illustrative preview · same data the protected portal shows
      </p>
    </div>
  );
}
