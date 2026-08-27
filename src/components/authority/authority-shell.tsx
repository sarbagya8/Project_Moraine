"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { portalRequest } from "@/lib/portal-api";
import { BrandLogo } from "@/components/shared/brand-logo";

const links = [
  ["Command center", "/responder/dashboard"],
  ["Active cases", "/responder/cases"],
  ["Trekkers", "/responder/users"],
  ["Safety devices", "/responder/devices"],
  ["Alert delivery", "/responder/notifications"],
  ["Case history", "/responder/case-history"],
  ["Settings", "/responder/settings"],
] as const;

export function AuthorityShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await portalRequest("/api/auth/logout", { method: "POST" });
    router.replace("/responder/login");
    router.refresh();
  }

  return (
    <div className="portal-layout">
      <header className="mobile-header">
        <BrandLogo variant="dark" subtitle="Responder" size="sm" onClick={() => setOpen(false)} />
        <button
          type="button"
          aria-expanded={open}
          aria-controls="responder-navigation"
          onClick={() => setOpen((value) => !value)}
        >
          Menu
        </button>
      </header>
      <aside id="responder-navigation" className={open ? "portal-sidebar is-open" : "portal-sidebar"}>
        <div className="space-y-1">
          <BrandLogo variant="dark" subtitle="Responder" size="md" onClick={() => setOpen(false)} />
          <p className="sidebar-caption text-[11px] font-bold tracking-widest text-[#aec0af] pt-1">
            Responder command center
          </p>
        </div>
        <nav aria-label="Responder navigation">
          {links.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              {label}
            </Link>
          ))}
        </nav>
        <button className="logout-button" type="button" onClick={() => void logout()}>
          Logout
        </button>
      </aside>
      <main className="portal-content">{children}</main>
    </div>
  );
}
