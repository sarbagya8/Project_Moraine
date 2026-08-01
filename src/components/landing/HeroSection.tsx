import Link from "next/link";
import { heroCredibility, portalRoutes } from "@/content/landing";
import { PhonePreview } from "./previews";

function MountainScene() {
  return (
    <svg
      className="land-mountain"
      viewBox="0 0 900 640"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="land-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#eef2e7" />
          <stop offset="55%" stopColor="#d8e1d2" />
          <stop offset="100%" stopColor="#c2d0bd" />
        </linearGradient>
        <linearGradient id="land-ridge-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a8bca2" />
          <stop offset="100%" stopColor="#8ba18a" />
        </linearGradient>
        <linearGradient id="land-ridge-mid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7c9378" />
          <stop offset="100%" stopColor="#5d775f" />
        </linearGradient>
        <linearGradient id="land-ridge-near" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#466346" />
          <stop offset="100%" stopColor="#2f4a37" />
        </linearGradient>
        <linearGradient id="land-ridge-dark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2c4634" />
          <stop offset="100%" stopColor="#183226" />
        </linearGradient>
      </defs>
      <rect width="900" height="640" fill="url(#land-sky)" />
      <path
        d="M-40 480 L190 300 L330 420 L500 250 L660 430 L820 330 L940 405 L940 640 L-40 640 Z"
        fill="url(#land-ridge-far)"
      />
      <path
        d="M-40 540 L160 400 L320 500 L470 360 L640 520 L820 430 L940 480 L940 640 L-40 640 Z"
        fill="url(#land-ridge-mid)"
      />
      <path
        d="M-40 570 L140 470 L300 540 L480 420 L660 540 L830 480 L940 520 L940 640 L-40 640 Z"
        fill="url(#land-ridge-near)"
      />
      <path
        d="M-40 602 L120 530 L270 580 L450 500 L620 584 L800 545 L940 570 L940 640 L-40 640 Z"
        fill="url(#land-ridge-dark)"
      />
    </svg>
  );
}

export function HeroSection() {
  return (
    <section className="land-hero">
      <div className="land-hero-scene" aria-hidden="true">
        <MountainScene />
      </div>
      <div className="land-hero-inner">
        <div className="land-hero-copy">
          <p className="land-eyebrow">Trekker safety, connected</p>
          <h1>Safety that stays with every step.</h1>
          <p className="land-hero-lead">
            ARGUS connects an ESP32 wearable, MAX30102 safety readings,
            Bluetooth, phone GPS, and a rescue dashboard so an emergency
            carries useful context—not only a distress signal.
          </p>
          <div className="land-actions">
            <Link className="land-button" href={portalRoutes.trekker}>
              Open Trekker Portal
              <span aria-hidden="true">→</span>
            </Link>
            <Link className="land-button land-button-light" href={portalRoutes.authority}>
              Authority Portal
            </Link>
            <a className="land-text-link" href="#emergency-flow">
              See the emergency flow ↓
            </a>
          </div>
        </div>
        <div className="land-hero-visual">
          <PhonePreview />
        </div>
      </div>
      <ul className="land-proof">
        {heroCredibility.map((item) => (
          <li key={item.name}>
            <strong>{item.name}</strong>
            <span>{item.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
