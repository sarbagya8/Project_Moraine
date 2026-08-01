import Link from "next/link";
import { navLinks, portalRoutes } from "@/content/landing";
import { LandingMobileMenu } from "./LandingMobileMenu";

export function LandingHeader() {
  return (
    <header className="land-header" data-landing-header>
      <div className="land-header-inner">
        <Link href="#land-content" className="land-brand">
          <span aria-hidden="true" className="land-brand-mark">A</span>
          ARGUS
        </Link>
        <nav className="land-nav" aria-label="Landing page">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
        <div className="land-login">
          <Link className="land-login-text" href={portalRoutes.trekker}>
            Trekker Login
          </Link>
          <Link className="land-login-solid" href={portalRoutes.authority}>
            Authority Login
          </Link>
        </div>
        <LandingMobileMenu />
      </div>
    </header>
  );
}
