function StatusPill({
  children,
  tone = "sage",
}: {
  children: React.ReactNode;
  tone?: "sage" | "red" | "amber";
}) {
  return <span className={`land-status land-status-${tone}`}>{children}</span>;
}

export function HeroProductScene() {
  return (
    <figure className="land-product-scene">
      <div className="land-scene-label">Field demo · Static preview</div>
      <div className="land-scene-landscape" aria-hidden="true">
        <span className="land-scene-sun" />
        <span className="land-scene-ridge land-scene-ridge-back" />
        <span className="land-scene-ridge land-scene-ridge-front" />
        <span className="land-scene-route land-scene-route-one" />
        <span className="land-scene-route land-scene-route-two" />
        <span className="land-scene-marker land-scene-marker-start" />
        <span className="land-scene-marker land-scene-marker-end" />
      </div>

      <div className="land-hero-device" aria-hidden="true">
        <span className="land-hero-strap land-hero-strap-top" />
        <span className="land-hero-watch">
          <small>DEMO</small>
          <b>88</b>
          <em>bpm</em>
        </span>
        <span className="land-hero-sos-button" />
        <span className="land-hero-strap land-hero-strap-bottom" />
      </div>

      <div className="land-hero-ble" aria-hidden="true"><span>BLE</span></div>

      <div className="land-hero-phone">
        <div className="land-phone-speaker" aria-hidden="true" />
        <header>
          <div>
            <span className="land-ui-label">Trekker Portal · Demo</span>
            <strong>Maya&apos;s trail status</strong>
          </div>
          <StatusPill>Connected</StatusPill>
        </header>
        <div className="land-phone-map" aria-hidden="true">
          <span className="land-phone-contour" />
          <span className="land-phone-route" />
          <span className="land-phone-pin" />
          <small>Mardi Himal route</small>
        </div>
        <div className="land-phone-readings">
          <div><span>Heart rate</span><strong>88 bpm</strong></div>
          <div><span>SpO₂</span><strong>97%</strong></div>
        </div>
        <div className="land-phone-location"><span>Location</span><strong>±18 m · Demo</strong></div>
        <div className="land-phone-status"><span>Context available</span><StatusPill tone="red">SOS ready</StatusPill></div>
      </div>

      <div className="land-hero-authority">
        <div className="land-authority-windowbar" aria-hidden="true"><span /><span /><span /></div>
        <span className="land-ui-label">Authority Portal · Demo</span>
        <div className="land-authority-alert">
          <span className="land-authority-avatar">MG</span>
          <div><strong>Maya Gurung</strong><small>TRK-DEMO-001</small></div>
          <StatusPill tone="red">Active SOS</StatusPill>
        </div>
        <div className="land-authority-context">
          <span>Map ready</span><span>Passport ready</span>
        </div>
      </div>

      <figcaption className="land-visually-hidden">
        Demo composition showing the ARGUS wristband connected to the Trekker Portal,
        route location, and Authority Portal.
      </figcaption>
    </figure>
  );
}

export function RescueDashboardPreview() {
  return (
    <article className="land-rescue-dashboard" aria-labelledby="rescue-record-title">
      <header className="land-dashboard-header">
        <div className="land-dashboard-title">
          <span className="land-record-label">Demo rescue record</span>
          <h3 id="rescue-record-title">Maya Gurung</h3>
          <p>TRK-DEMO-001 · Mardi Himal route</p>
        </div>
        <div className="land-dashboard-state">
          <span>Event status</span>
          <StatusPill tone="red">Active SOS</StatusPill>
        </div>
      </header>

      <div className="land-dashboard-summary">
        <div><span>Heart rate</span><strong>88 bpm</strong><small>Latest available</small></div>
        <div><span>SpO₂</span><strong>97%</strong><small>Latest available</small></div>
        <div><span>Reading freshness</span><strong>42 sec</strong><small>Before SOS</small></div>
        <div><span>GPS accuracy</span><strong>±18 m</strong><small>Browser location</small></div>
      </div>

      <div className="land-dashboard-main">
        <div className="land-dashboard-map">
          <div className="land-dashboard-contours" aria-hidden="true" />
          <span className="land-dashboard-route" aria-hidden="true" />
          <span className="land-dashboard-pin" aria-hidden="true" />
          <div className="land-map-caption">
            <span>Last available location</span>
            <strong>28.4572° N, 83.9546° E</strong>
          </div>
        </div>

        <dl className="land-dashboard-details">
          <div><dt>Symptom report</dt><dd>Headache and dizziness</dd></div>
          <div><dt>SOS source</dt><dd>Physical wristband button</dd></div>
          <div><dt>Event time</dt><dd>08:42 NPT</dd></div>
          <div><dt>WhatsApp delivery</dt><dd><StatusPill tone="amber">Accepted by provider</StatusPill></dd></div>
          <div><dt>Location</dt><dd>Browser location available</dd></div>
          <div><dt>Altitude, when available</dt><dd>Unavailable in this demo</dd></div>
        </dl>
      </div>

      <footer className="land-dashboard-footer">
        <p>Static preview. No live or production records are shown.</p>
        <div role="group" aria-label="Actions available in the real Authority Portal">
          <span>Open map ↗</span>
          <span>Open Rescue Passport ↗</span>
        </div>
      </footer>
    </article>
  );
}
