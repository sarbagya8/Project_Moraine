"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { navLinks, portalRoutes } from "@/content/landing";

export function LandingMobileMenu() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector("a")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      previouslyFocused?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        className="land-menu-button"
        type="button"
        aria-expanded={open}
        aria-controls="land-mobile-navigation"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Close" : "Menu"}
      </button>
      <div
        ref={panelRef}
        className="land-mobile-panel"
        id="land-mobile-navigation"
        hidden={!open}
      >
        <nav aria-label="Mobile landing navigation">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} onClick={() => setOpen(false)}>
              {link.label}
            </a>
          ))}
          <div className="land-mobile-login">
            <Link href={portalRoutes.trekker} onClick={() => setOpen(false)}>
              Trekker Login
            </Link>
            <Link href={portalRoutes.authority} onClick={() => setOpen(false)}>
              Authority Login
            </Link>
          </div>
        </nav>
      </div>
    </>
  );
}
