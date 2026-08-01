"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { navLinks, portalRoutes } from "@/content/landing";

export function LandingHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const updateHeader = () => setScrolled(window.scrollY > 20);
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    return () => window.removeEventListener("scroll", updateHeader);
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const toggleButton = toggleRef.current;
    const focusable = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>("a, button") ?? [],
    );

    document.body.style.overflow = "hidden";
    focusable[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }

      if (event.key !== "Tab" || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      toggleButton?.focus();
    };
  }, [open]);

  const closeMenu = () => setOpen(false);

  return (
    <header className="land-header" data-scrolled={scrolled || undefined}>
      <div className="land-header-inner">
        <Link className="land-brand" href="/" aria-current="page" aria-label="ARGUS home">
          <span className="land-brand-mark" aria-hidden="true">A</span>
          <span>ARGUS</span>
        </Link>

        <nav className="land-nav" aria-label="Primary navigation">
          {navLinks.map((link) => (
            <a href={link.href} key={link.href}>{link.label}</a>
          ))}
        </nav>

        <div className="land-portal-links">
          <Link href={portalRoutes.trekker}>Trekker Portal</Link>
          <Link className="land-header-button" href={portalRoutes.authority}>
            Authority Portal
          </Link>
        </div>

        <button
          ref={toggleRef}
          className="land-menu-button"
          type="button"
          aria-expanded={open}
          aria-controls="landing-mobile-menu"
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setOpen((value) => !value)}
        >
          <span aria-hidden="true">{open ? "Close" : "Menu"}</span>
        </button>
      </div>

      <div
        ref={menuRef}
        className="land-mobile-menu"
        id="landing-mobile-menu"
        hidden={!open}
      >
        <nav aria-label="Mobile navigation">
          {navLinks.map((link) => (
            <a href={link.href} key={link.href} onClick={closeMenu}>{link.label}</a>
          ))}
          <Link href={portalRoutes.trekker} onClick={closeMenu}>Open Trekker Portal</Link>
          <Link className="land-mobile-authority" href={portalRoutes.authority} onClick={closeMenu}>
            Open Authority Portal
          </Link>
        </nav>
      </div>
    </header>
  );
}
