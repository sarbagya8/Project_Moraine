import Link from "next/link";
import type { ReactNode } from "react";

export interface BrandLogoProps {
  /**
   * Theme variant for the logo
   * - "light": Dark green logo on cream / light background (Landing, Trekker, Sign in)
   * - "dark": Light cream / emerald logo on dark forest green background (Responder Shell, Sidebar)
   */
  variant?: "light" | "dark";
  /**
   * Optional subtitle next to MORAINE (e.g. "Trekker", "Responder", "Cockpit")
   */
  subtitle?: string;
  /**
   * Optional badge pill (e.g. "Himalayan Trek Safe")
   */
  tag?: string;
  /**
   * Size presets
   */
  size?: "sm" | "md" | "lg";
  /**
   * Target link for redirect (defaults to root "/")
   */
  href?: string;
  /**
   * Additional custom CSS classes for the outer link container
   */
  className?: string;
  /**
   * Optional click handler (e.g. to close mobile menu on click)
   */
  onClick?: () => void;
}

export function AlpinePeakMark({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Twin Alpine Peaks Silhouette with Ridge Facets */}
      <path
        d="M2.5 18.5L9.5 5L14.5 13.5L17.5 9L21.5 18.5H2.5Z"
        fill="currentColor"
        fillOpacity="0.22"
      />
      <path
        d="M2.5 18.5L9.5 5L14.5 13.5L17.5 9L21.5 18.5H2.5Z"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Primary Peak Ridge Accent */}
      <path
        d="M9.5 5L11.5 10.5L9.5 14L9 18.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.75"
      />
      {/* Secondary Peak Ridge */}
      <path
        d="M17.5 9L18.5 12.5L17.5 18.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.65"
      />
    </svg>
  );
}

export function BrandLogo({
  variant = "light",
  subtitle,
  tag,
  size = "md",
  href = "/",
  className = "",
  onClick,
}: BrandLogoProps) {
  const isDark = variant === "dark";

  // Size styling mappings
  const badgeSizes = {
    sm: "w-7 h-7 rounded-lg",
    md: "w-8 h-8 rounded-xl",
    lg: "w-9 h-9 rounded-xl",
  };

  const iconSizes = {
    sm: "w-3.5 h-3.5",
    md: "w-4 h-4",
    lg: "w-4.5 h-4.5",
  };

  const textSizes = {
    sm: "text-base tracking-[0.14em]",
    md: "text-lg sm:text-xl tracking-[0.16em]",
    lg: "text-xl sm:text-2xl tracking-[0.18em]",
  };

  return (
    <Link
      href={href}
      onClick={onClick}
      className={`group inline-flex items-center gap-2.5 font-bold cursor-pointer select-none transition-all duration-200 active:scale-[0.97] ${className}`.trim()}
      aria-label="MORAINE Home"
    >
      {/* Mountain Crest Icon Mark */}
      <span
        className={`flex items-center justify-center shrink-0 shadow-sm transition-all duration-200 group-hover:scale-105 group-hover:shadow ${
          badgeSizes[size]
        } ${
          isDark
            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 group-hover:bg-emerald-500/30 group-hover:border-emerald-300/50"
            : "bg-[#0a2e1c] text-[#f7f5f0] border border-[#14462c]/30 group-hover:bg-[#103a24]"
        }`}
      >
        <AlpinePeakMark className={`${iconSizes[size]} transition-transform duration-200 group-hover:-translate-y-0.5`} />
      </span>

      {/* Brand Text Typography */}
      <span className="inline-flex items-baseline gap-1.5 leading-none">
        <span
          className={`font-black uppercase ${textSizes[size]} transition-colors duration-200 ${
            isDark
              ? "text-[#f7f5f0] group-hover:text-white"
              : "text-[#0a2e1c] group-hover:text-[#124229]"
          }`}
        >
          MORAINE
        </span>

        {subtitle ? (
          <span
            className={`font-bold text-xs sm:text-sm tracking-normal transition-colors duration-200 ${
              isDark
                ? "text-emerald-300/85 group-hover:text-emerald-200"
                : "text-[#405b4a] group-hover:text-[#0a2e1c]"
            }`}
          >
            {subtitle}
          </span>
        ) : null}
      </span>

      {/* Optional Tag Badge */}
      {tag ? (
        <span
          className={`hidden sm:inline-flex items-center text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full border transition-colors duration-200 ${
            isDark
              ? "bg-emerald-950/70 text-emerald-300 border-emerald-700/50"
              : "bg-[#e6ece2] text-[#2d4b38] border-[#cdd8c9] group-hover:border-[#b8c9b3]"
          }`}
        >
          {tag}
        </span>
      ) : null}
    </Link>
  );
}
