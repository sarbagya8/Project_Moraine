import { RescueDashboardPreview } from "./previews";

export function RescueSnapshot() {
  return (
    <section className="land-snapshot" aria-labelledby="snapshot-title">
      <div className="land-snapshot-heading">
        <div>
          <p className="land-eyebrow">Authority rescue view</p>
          <h2 id="snapshot-title">What rescuers see first.</h2>
        </div>
        <p>
          The same emergency record keeps identity, location, available readings,
          symptoms, and notification state together.
        </p>
      </div>
      <RescueDashboardPreview />
    </section>
  );
}
