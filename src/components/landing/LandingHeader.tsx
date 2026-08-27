"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function LandingHeader() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-50 w-full bg-[#f7f5f0]/90 backdrop-blur-md border-b border-[#d8ded4] transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 lg:px-8 h-18">
        {/* Brand Logo */}
        <Link href="/" className="inline-flex items-center gap-2.5 text-xl font-black tracking-wider text-[#0a2e1c]">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#0a2e1c] text-[#f7f5f0] text-xs font-bold shadow-sm">
            ▲
          </span>
          <span className="font-extrabold tracking-tight text-lg sm:text-xl">ARGUS</span>
          <span className="hidden sm:inline-block text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-[#e6ece2] text-[#2d4b38] border border-[#cdd8c9]">
            Himalayan Trek Safe
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6 lg:gap-8 text-xs font-bold uppercase tracking-wider text-[#405b4a]">
          <a href="#platform" className="hover:text-[#0a2e1c] transition-colors">Platform</a>
          <a href="#capabilities" className="hover:text-[#0a2e1c] transition-colors">Capabilities</a>
          <a href="#hardware" className="hover:text-[#0a2e1c] transition-colors">Hardware</a>
          <a href="#how-it-works" className="hover:text-[#0a2e1c] transition-colors">How it works</a>
          <a href="#cave-rescue" className="hover:text-[#0a2e1c] transition-colors">Cave Rescue</a>
          <a href="#for-responders" className="hover:text-[#0a2e1c] transition-colors">Responders</a>
        </nav>

        {/* Portal & Sign In Actions */}
        <div className="flex items-center gap-3">
          <div className="relative" ref={menuRef}>
            <button
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-[#0a2e1c] bg-[#e6ece2] hover:bg-[#d8e3d3] border border-[#cbd7c7] transition-all cursor-pointer"
              type="button"
              aria-expanded={open}
              aria-haspopup="menu"
              onClick={() => setOpen((value) => !value)}
            >
              <span className="text-sm">⌁</span>
              <span>Portals</span>
              <span className="text-[10px] opacity-60">▼</span>
            </button>

            {open ? (
              <div
                className="absolute right-0 top-full mt-2 w-64 p-2 rounded-2xl bg-white border border-[#d8ded4] shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-150"
                role="menu"
              >
                <Link
                  href="/user/login"
                  role="menuitem"
                  className="flex flex-col p-3 rounded-xl hover:bg-[#f7f5f0] text-[#0a2e1c] transition-colors group"
                  onClick={() => setOpen(false)}
                >
                  <strong className="text-xs font-bold flex items-center justify-between">
                    Trekker Portal
                    <span className="text-[10px] text-[#405b4a] group-hover:translate-x-0.5 transition-transform">→</span>
                  </strong>
                  <span className="text-[11px] text-[#576b5d] mt-0.5">Expedition telemetry &amp; cockpit</span>
                </Link>
                <div className="my-1 border-t border-[#edf1ea]" />
                <Link
                  href="/responder/login"
                  role="menuitem"
                  className="flex flex-col p-3 rounded-xl hover:bg-[#f7f5f0] text-[#0a2e1c] transition-colors group"
                  onClick={() => setOpen(false)}
                >
                  <strong className="text-xs font-bold flex items-center justify-between">
                    Responder Portal
                    <span className="text-[10px] text-[#405b4a] group-hover:translate-x-0.5 transition-transform">→</span>
                  </strong>
                  <span className="text-[11px] text-[#576b5d] mt-0.5">Emergency Command Center</span>
                </Link>
              </div>
            ) : null}
          </div>

          <Link
            href="/user/login"
            className="hidden sm:inline-flex items-center justify-center px-4 py-2 rounded-xl text-xs font-bold text-[#f7f5f0] bg-[#0a2e1c] hover:bg-[#123d27] transition-all shadow-sm"
          >
            Sign In
          </Link>
        </div>
      </div>
    </header>
  );
}
