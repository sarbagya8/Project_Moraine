const contextItems = [
  "Location",
  "Symptoms",
  "Heart rate",
  "SpO₂",
  "Trekker ID",
  "SOS timestamp",
] as const;

export function TourismProblem() {
  return (
    <section className="land-problem" id="about" aria-labelledby="problem-title">
      <div className="land-problem-copy">
        <p className="land-eyebrow">Tourism and trail safety</p>
        <h2 id="problem-title">When a trekker needs help, information is often scattered.</h2>
        <p>
          Nepal&apos;s trails connect visitors with landscapes, local communities,
          and living heritage. But when a trekker becomes unwell or loses contact,
          the emergency message may contain very little context.
        </p>
        <p>
          Location, recent readings, symptoms, and identity may be spread across
          different devices and people. ARGUS brings the available information
          together before it reaches the rescue side.
        </p>
      </div>

      <div className="land-context-merge" role="img" aria-label="Six pieces of trekker context joining one rescue record">
        <div className="land-context-items">
          {contextItems.map((item) => <span key={item}>{item}</span>)}
        </div>
        <div className="land-context-route" aria-hidden="true"><span /></div>
        <div className="land-context-record">
          <span className="land-record-label">ARGUS rescue record</span>
          <strong>One clear emergency view</strong>
          <small>Available context, gathered before rescue review</small>
        </div>
      </div>
    </section>
  );
}
