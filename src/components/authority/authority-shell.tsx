"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { portalRequest } from "@/lib/portal-api";

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
        <Link href="/responder/dashboard" className="brand">ARGUS</Link>
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
        <div>
          <Link href="/responder/dashboard" className="brand">ARGUS</Link>
          <p className="sidebar-caption">Responder command center</p>
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
