import { emergencySteps } from "@/content/landing";

export function EmergencyJourney() {
  return (
    <section className="land-section land-journey" id="emergency-flow">
      <div className="land-journey-head">
        <p className="land-eyebrow">Emergency walkthrough</p>
        <h2>One emergency, traced end to end.</h2>
        <p className="land-journey-lead">
          “A trekker on the Mardi Himal route feels unwell.” Here is how ARGUS
          turns that moment into usable rescue context.
        </p>
      </div>
      <ol className="land-journey-steps">
        {emergencySteps.map((step, index) => (
          <li key={step.title}>
            <span className="land-journey-marker" aria-hidden="true" />
            <span className="land-step-number">{index + 1}</span>
            <div>
              <h3>{step.title}</h3>
              <p>{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
