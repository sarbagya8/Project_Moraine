"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { portalRequest } from "@/lib/portal-api";

const links = [
  ["Overview", "/authority/dashboard"],
  ["Active Emergencies", "/authority/emergencies"],
  ["Trekkers", "/authority/trekkers"],
  ["Devices", "/authority/devices"],
  ["Notifications", "/authority/notifications"],
  ["Settings", "/authority/settings"],
] as const;

export function AuthorityShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await portalRequest("/api/auth/logout", { method: "POST" });
    router.replace("/authority/login");
    router.refresh();
  }

  return (
    <div className="portal-layout">
      <header className="mobile-header">
        <Link href="/authority/dashboard" className="brand">ARGUS</Link>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="authority-navigation"
          onClick={() => setOpen((value) => !value)}
        >
          Menu
        </button>
      </header>
      <aside id="authority-navigation" className={open ? "portal-sidebar is-open" : "portal-sidebar"}>
        <div>
          <Link href="/authority/dashboard" className="brand">ARGUS</Link>
          <p className="sidebar-caption">Authority / Rescue</p>
        </div>
        <nav aria-label="Authority navigation">
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
