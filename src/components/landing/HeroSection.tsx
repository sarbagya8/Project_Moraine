import Link from "next/link";
import { portalRoutes } from "@/content/landing";
import { HeroProductScene } from "./previews";

export function HeroSection() {
  return (
    <section className="land-hero" aria-labelledby="hero-title">
      <div className="land-hero-copy">
        <p className="land-eyebrow">Connected trekking safety</p>
        <h1 id="hero-title">Safety that travels with the trekker.</h1>
        <p className="land-hero-lead">
          ARGUS combines a wearable safety device with a connected rescue platform.
          It brings available readings, location, symptoms, and SOS details into one
          emergency record that rescuers can review quickly.
        </p>
        <div className="land-actions">
          <Link className="land-button land-button-primary" href={portalRoutes.trekker}>
            Open Trekker Portal <span aria-hidden="true">→</span>
          </Link>
          <Link className="land-button land-button-secondary" href={portalRoutes.authority}>
            View Authority Portal
          </Link>
        </div>
        <div className="land-hero-links">
          <p><span aria-hidden="true" />Built for safer trekking and adventure tourism.</p>
          <a href="#demo">Watch the system demo <span aria-hidden="true">↓</span></a>
        </div>
      </div>
      <HeroProductScene />
    </section>
  );
}
