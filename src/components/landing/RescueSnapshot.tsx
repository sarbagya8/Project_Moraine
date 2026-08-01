import Link from "next/link";
import { StatusPill } from "./previews";

export function RescueSnapshot() {
  return (
    <section className="land-section land-snapshot" id="rescue-view">
      <div className="land-snapshot-grid">
        <div className="land-snapshot-copy">
          <p className="land-eyebrow">Rescue snapshot</p>
          <h2>What rescuers open first.</h2>
          <p>
            A compact, printed-paper Rescue Passport built from the same data
            record. It shows identity, the latest sensor values, GPS accuracy,
            symptoms, notification state, and a direct map link.
          </p>
          <Link className="land-button land-button-light" href="/authority/login">
            Open the real Authority Portal
            <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className="land-snapshot-card" aria-label="Sample Rescue Snapshot">
          <div className="land-snapshot-card-head">
            <div>
              <p className="land-mini-eyebrow">RESCUE PASSPORT · sample</p>
              <strong>Sarbagya Acharya</strong>
              <span>TRK-DEMO-001 · Mardi Himal Trek</span>
            </div>
            <StatusPill label="Active" tone="red" />
          </div>
          <dl className="land-snapshot-details">
            <div>
              <dt>Trekker ID</dt>
              <dd>TRK-DEMO-001</dd>
            </div>
            <div>
              <dt>Route</dt>
              <dd>Mardi Himal Trek</dd>
            </div>
            <div>
              <dt>Heart rate</dt>
              <dd>88 bpm</dd>
            </div>
            <div>
              <dt>SpO₂</dt>
              <dd>97%</dd>
            </div>
            <div>
              <dt>Sensor freshness</dt>
              <dd className="land-snapshot-good">Recent · 1 s ago</dd>
            </div>
            <div>
              <dt>GPS accuracy</dt>
              <dd>±10 m</dd>
            </div>
            <div>
              <dt>Symptom</dt>
              <dd>Headache · mild</dd>
            </div>
            <div>
              <dt>SOS timestamp</dt>
              <dd>08:42 local</dd>
            </div>
            <div>
              <dt>Notification</dt>
              <dd className="land-snapshot-pending">Pending</dd>
            </div>
          </dl>
          <div className="land-snapshot-actions">
            <span className="land-button-mini" aria-hidden="true">
              Open map ↗
            </span>
            <span className="land-button-mini" aria-hidden="true">
              Open Rescue Passport ↗
            </span>
          </div>
          <p className="land-illustrative-note">
            Static sample preview · does not read production records
          </p>
        </div>
      </div>
    </section>
  );
}
