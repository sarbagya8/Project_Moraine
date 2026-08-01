import Link from "next/link";
import { portalRoutes } from "@/content/landing";

export function LandingFooter() {
  return (
    <footer className="land-footer">
      <div className="land-footer-brand">
        <Link href="#land-content" className="land-brand land-brand-on-dark">
          <span aria-hidden="true" className="land-brand-mark">A</span>
          ARGUS
        </Link>
        <p>
          Connected safety context for trekkers and rescue teams. A hackathon
          prototype, built honestly.
        </p>
      </div>
      <div className="land-footer-column">
        <strong>Explore</strong>
        <a href="#how-it-works">How it works</a>
        <a href="#wristband">Wearable</a>
        <a href="#emergency-flow">Emergency flow</a>
        <a href="#rescue-view">Rescue view</a>
      </div>
      <div className="land-footer-column">
        <strong>Portals</strong>
        <Link href={portalRoutes.trekker}>Trekker Portal</Link>
        <Link href={portalRoutes.authority}>Authority Portal</Link>
        <a href="#limitations">Prototype considerations</a>
        <a href="#about">About ARGUS</a>
      </div>
      <div className="land-footer-credit">
        <p>
          Hackathon project · Team ARGUS · {new Date().getFullYear()}
        </p>
        <p>
          ESP32 · MAX30102 · BLE · phone GPS · Supabase · WhatsApp Cloud API
        </p>
      </div>
    </footer>
  );
}
