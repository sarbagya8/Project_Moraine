import Link from "next/link";
import { portalRoutes } from "@/content/landing";

export function PortalSection() {
  return (
    <section className="land-portals" id="portals" aria-labelledby="portals-title">
      <div className="land-portals-heading">
        <p className="land-eyebrow">Open the working product</p>
        <h2 id="portals-title">See ARGUS from both sides of the emergency.</h2>
      </div>

      <div className="land-portal-panels">
        <article className="land-portal-trekker">
          <span className="land-portal-index">01 / Trekker side</span>
          <h3>Trekker Portal</h3>
          <p>
            Connect the assigned wristband, review current status, share location,
            report symptoms, and activate SOS.
          </p>
          <Link className="land-button land-button-primary" href={portalRoutes.trekker}>
            Open Trekker Portal <span aria-hidden="true">→</span>
          </Link>
        </article>

        <article className="land-portal-authority">
          <span className="land-portal-index">02 / Rescue side</span>
          <h3>Authority Portal</h3>
          <p>
            Review emergency records, available readings, location, symptoms,
            Rescue Passport, and notification state.
          </p>
          <Link className="land-button land-button-light" href={portalRoutes.authority}>
            Open Authority Portal <span aria-hidden="true">→</span>
          </Link>
        </article>
      </div>

      <div className="land-final-cta">
        <div>
          <p className="land-eyebrow">ARGUS</p>
          <h3>Better information. Faster decisions.</h3>
          <p>
            ARGUS is designed to help rescue teams receive clearer emergency
            context when every minute matters.
          </p>
        </div>
        <div className="land-actions">
          <Link className="land-button land-button-primary" href={portalRoutes.trekker}>Open Trekker Portal</Link>
          <Link className="land-button land-button-secondary" href={portalRoutes.authority}>View Authority Portal</Link>
        </div>
      </div>
    </section>
  );
}
