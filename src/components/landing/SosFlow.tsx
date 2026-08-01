import { sosSteps } from "@/content/landing";

export function SosFlow() {
  return (
    <section className="land-sos" id="sos-flow" aria-labelledby="sos-title">
      <div className="land-sos-inner">
        <div className="land-sos-heading">
          <p className="land-eyebrow land-eyebrow-alert">Emergency sequence</p>
          <h2 id="sos-title">From SOS to rescue context.</h2>
          <p>A trekker on a high-altitude route starts feeling unwell.</p>
        </div>

        <ol className="land-sos-timeline">
          {sosSteps.map((step, index) => (
            <li key={step.title}>
              <span className="land-sos-marker">{index + 1}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="land-sos-context" role="group" aria-label="Information carried with the demo SOS">
          <div className="land-sos-source">
            <span className="land-sos-button-visual" aria-hidden="true" />
            <div><small>SOS source</small><strong>Wristband button</strong></div>
          </div>
          <div className="land-sos-payload">
            <span>Latest reading</span>
            <span>Browser location</span>
            <span>Symptom report</span>
            <span>08:42 NPT</span>
          </div>
          <div className="land-sos-delivery">
            <span className="land-delivery-icon" aria-hidden="true" />
            <div><small>Rescue side</small><strong>Portal + WhatsApp alert</strong></div>
          </div>
        </div>
      </div>
    </section>
  );
}
