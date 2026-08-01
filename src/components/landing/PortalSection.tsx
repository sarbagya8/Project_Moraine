import Link from "next/link";
import { limitations, portalRoutes } from "@/content/landing";

const techStack = [
  { group: "Hardware", items: ["ESP32", "MAX30102", "Physical SOS button"] },
  {
    group: "Connectivity",
    items: ["Bluetooth Low Energy", "Browser phone GPS"],
  },
  { group: "Platform", items: ["Next.js", "TypeScript", "Supabase / PostgreSQL"] },
  { group: "Emergency communication", items: ["WhatsApp Cloud API"] },
] as const;

export function PortalSection() {
  return (
    <>
      <section className="land-section land-portals" id="portals">
        <div className="land-section-intro">
          <p className="land-eyebrow">Two connected portals</p>
          <h2>Built around the people who use it.</h2>
        </div>
        <div className="land-portal-grid">
          <article className="land-portal-card">
            <p className="land-eyebrow">For trekkers</p>
            <h3>Carry your safety view.</h3>
            <p>
              Connect the assigned ARGUS wristband, view live readings, share
              phone GPS, report symptoms, and activate an SOS.
            </p>
            <Link className="land-button" href={portalRoutes.trekker}>
              Enter Trekker Portal
              <span aria-hidden="true">→</span>
            </Link>
          </article>
          <article className="land-portal-card land-portal-authority">
            <p className="land-eyebrow">For rescue authorities</p>
            <h3>See the emergency context.</h3>
            <p>
              Review active emergencies, device status, readings, symptoms,
              GPS, rescue details, and notification state.
            </p>
            <Link
              className="land-button land-button-light land-button-on-dark"
              href={portalRoutes.authority}
            >
              Open Authority Portal
              <span aria-hidden="true">→</span>
            </Link>
          </article>
        </div>
      </section>

      <section className="land-section land-tech">
        <div className="land-section-intro">
          <p className="land-eyebrow">Technology</p>
          <h2>Purpose-built prototype stack.</h2>
        </div>
        <dl className="land-tech-grid">
          {techStack.map((group) => (
            <div key={group.group}>
              <dt>{group.group}</dt>
              {group.items.map((item) => (
                <dd key={item}>{item}</dd>
              ))}
            </div>
          ))}
        </dl>
      </section>

      <section className="land-section land-limits" id="limitations">
        <div className="land-section-intro">
          <p className="land-eyebrow">Prototype considerations</p>
          <h2>Transparent by design.</h2>
          <p>
            ARGUS is a working prototype. These boundaries are intentional and
            accurate.
          </p>
        </div>
        <ul className="land-limits-list">
          {limitations.map((item) => (
            <li key={item.title}>
              <strong>{item.title}</strong>
              <span>{item.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="land-cta">
        <div className="land-cta-topo" aria-hidden="true">
          <svg viewBox="0 0 900 300" preserveAspectRatio="xMidYMid slice">
            <path
              d="M0 210 L150 120 L260 180 L410 70 L560 190 L720 110 L900 170 L900 300 L0 300 Z"
              fill="rgba(255,255,255,0.05)"
            />
            <path
              d="M0 235 L140 160 L280 210 L440 110 L590 220 L760 150 L900 200 L900 300 L0 300 Z"
              fill="rgba(255,255,255,0.07)"
            />
          </svg>
        </div>
        <div className="land-cta-inner">
          <p className="land-eyebrow land-eyebrow-on-dark">ARGUS connected safety</p>
          <h2>Built for the moments when every signal matters.</h2>
          <div className="land-actions land-actions-center">
            <Link className="land-button land-button-on-dark" href={portalRoutes.trekker}>
              Open Trekker Portal
              <span aria-hidden="true">→</span>
            </Link>
            <Link className="land-button land-button-light land-button-on-dark" href={portalRoutes.authority}>
              View Authority Portal
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
