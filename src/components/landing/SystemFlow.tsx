import { systemPhases } from "@/content/landing";

export function SystemFlow() {
  return (
    <section className="land-system" id="how-it-works" aria-labelledby="system-title">
      <div className="land-section-heading">
        <div>
          <p className="land-eyebrow">How the parts connect</p>
          <h2 id="system-title">One connected system from wristband to rescue.</h2>
        </div>
        <p>
          Each layer adds context without hiding unavailable readings or delivery state.
        </p>
      </div>

      <div className="land-system-phases" role="list" aria-label="ARGUS product system phases">
        {systemPhases.map((phase, index) => (
          <article className="land-system-phase" role="listitem" key={phase.label}>
            <div className={`land-system-icon land-system-icon-${phase.visual}`} aria-hidden="true">
              <span />
            </div>
            <span className="land-phase-number">0{index + 1}</span>
            <h3>{phase.label}</h3>
            <p>{phase.description}</p>
            <div className="land-phase-nodes">
              {phase.nodes.map((node) => <strong key={node}>{node}</strong>)}
            </div>
            <small>{phase.note}</small>
          </article>
        ))}
      </div>

      <ol className="land-data-route" aria-label="Complete data route">
        {[
          "MAX30102",
          "ESP32 wristband",
          "BLE",
          "Trekker Portal",
          "Location + symptoms",
          "Authenticated backend",
          "Supabase",
          "Authority Portal",
          "WhatsApp alert",
        ].map((node) => <li key={node}>{node}</li>)}
      </ol>
    </section>
  );
}
