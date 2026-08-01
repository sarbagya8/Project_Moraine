import Link from "next/link";
import { portalRoutes } from "@/content/landing";

export function LandingFooter() {
  return (
    <footer className="land-footer">
      <div className="land-footer-intro">
        <Link className="land-brand land-brand-footer" href="/" aria-label="ARGUS home">
          <span className="land-brand-mark" aria-hidden="true">A</span>
          <span>ARGUS</span>
        </Link>
        <p>A connected trekking-safety prototype for adventure tourism.</p>
      </div>
      <nav aria-label="Footer navigation">
        <a href="#how-it-works">How it works</a>
        <a href="#demo">Demo</a>
        <a href="#prototype">Prototype</a>
        <Link href={portalRoutes.trekker}>Trekker Portal</Link>
        <Link href={portalRoutes.authority}>Authority Portal</Link>
      </nav>
      <p className="land-footer-credit">Team ARGUS · {new Date().getFullYear()}</p>
    </footer>
  );
}
