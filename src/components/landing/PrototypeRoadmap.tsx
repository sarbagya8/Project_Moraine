import { roadmapPhases } from "@/content/landing";

export function PrototypeRoadmap() {
  return (
    <section className="land-roadmap" id="prototype" aria-labelledby="prototype-title">
      <div className="land-section-heading land-roadmap-heading">
        <div>
          <p className="land-eyebrow">Prototype roadmap</p>
          <h2 id="prototype-title">What works now. What comes next.</h2>
        </div>
        <p>
          Phase 1 is the current prototype. Phase 2 and Phase 3 show the path
          toward field testing and remote trail communication.
        </p>
      </div>

      <div className="land-roadmap-track" aria-hidden="true"><span /></div>
      <div className="land-roadmap-phases">
        {roadmapPhases.map((phase) => (
          <article className={phase.current ? "land-roadmap-phase is-current" : "land-roadmap-phase"} key={phase.phase}>
            <div className="land-roadmap-topline">
              <span>{phase.phase}</span>
              <strong>{phase.status}</strong>
            </div>
            <h3>{phase.label}</h3>
            <ul>
              {phase.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
