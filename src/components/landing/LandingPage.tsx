import Link from "next/link";
import { HeroSection } from "./HeroSection";
import { LandingFooter } from "./LandingFooter";
import { LandingHeader } from "./LandingHeader";

const capabilityTiles = [
  {
    number: "01",
    title: "Altitude & Barometric Pressure",
    tag: "Elevation",
    detail: "Available barometric altitude is kept in the expedition record when the device sends it.",
    highlight: "4,500m",
  },
  {
    number: "02",
    title: "Device signal & BLE Link",
    tag: "Connectivity",
    detail: "Connection state and signal freshness make it clear what the platform knows right now.",
    highlight: "Live Sync",
  },
  {
    number: "03",
    title: "Fall detection & Motion",
    tag: "Safety",
    detail: "A reported fall state can travel with the emergency snapshot when it is available.",
    highlight: "Auto-Triage",
  },
  {
    number: "04",
    title: "Phone GPS & Trail Location",
    tag: "Navigation",
    detail: "Phone GPS is shown honestly as a recent, stale, or unavailable last-known location.",
    highlight: "Last Fix",
  },
  {
    number: "05",
    title: "SOS Single-Flight Dispatch",
    tag: "Emergency",
    detail: "Physical and portal SOS routes create one focused emergency record for responders.",
    highlight: "Zero-Duplicate",
  },
  {
    number: "06",
    title: "Available telemetry",
    tag: "Vitals",
    detail: "Heart rate, SpO₂, temperature, pressure and route progress appear only when received.",
    highlight: "Real Only",
  },
] as const;

const chain = [
  { step: "01", label: "Trekker", desc: "Equipped with wearable" },
  { step: "02", label: "Safety device", desc: "Sensors & barometrics" },
  { step: "03", label: "BLE", desc: "Local peer sync" },
  { step: "04", label: "Platform", desc: "Honest state engine" },
  { step: "05", label: "Responder", desc: "Triage & coordinates" },
  { step: "06", label: "Rescue", desc: "Direct field dispatch" },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#f7f5f0] text-[#10291e] topo-contour-cream selection:bg-[#c5dccb] selection:text-[#0a2e1c]">
      <a className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:p-4 focus:bg-white focus:text-black focus:rounded-xl focus:shadow-2xl" href="#main-content">
        Skip to main content
      </a>
      
      <LandingHeader />
      
      <main id="main-content">
        <HeroSection />

        {/* Trail Proof Banner */}
        <section className="border-y border-[#d8ded4] bg-[#eef3eb] py-4 px-4" aria-label="Platform principles">
          <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <span className="text-xs font-black uppercase tracking-widest text-[#2c4736] flex items-center justify-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0a2e1c]" />
              Built for the trail
            </span>
            <span className="text-xs font-black uppercase tracking-widest text-[#2c4736] flex items-center justify-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0a2e1c]" />
              Real data only
            </span>
            <span className="text-xs font-black uppercase tracking-widest text-[#2c4736] flex items-center justify-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0a2e1c]" />
              Signal freshness visible
            </span>
            <span className="text-xs font-black uppercase tracking-widest text-[#2c4736] flex items-center justify-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0a2e1c]" />
              Authorized response
            </span>
          </div>
        </section>

        {/* Section 1: Platform Principles & Story */}
        <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto" id="platform">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            <div className="lg:col-span-5 space-y-4">
              <p className="text-xs font-black uppercase tracking-widest text-[#4d6655]">Safety that stays grounded</p>
              <h2 className="text-3xl sm:text-4xl font-black text-[#0a2e1c] tracking-tight leading-tight">
                When the route changes, the right context should still get through.
              </h2>
              <p className="text-[#4b5e51] leading-relaxed text-sm sm:text-base font-medium">
                MORAINE connects an assigned safety device, phone location, and an emergency workflow. It never fills gaps with assumptions: unavailable signals remain unavailable, and last-known locations stay clearly labelled.
              </p>
            </div>

            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-5">
              <article className="p-6 rounded-2xl bg-white border border-[#d8ded4] shadow-sm hover:shadow-md transition-all space-y-3">
                <span className="inline-block text-xs font-black px-2.5 py-1 rounded-md bg-[#e6ece2] text-[#0a2e1c]">01</span>
                <h3 className="text-lg font-black text-[#0a2e1c]">Know your signal</h3>
                <p className="text-xs text-[#576b5d] leading-relaxed">
                  Device link, available telemetry, and GPS freshness are readable at a glance.
                </p>
              </article>

              <article className="p-6 rounded-2xl bg-white border border-[#d8ded4] shadow-sm hover:shadow-md transition-all space-y-3">
                <span className="inline-block text-xs font-black px-2.5 py-1 rounded-md bg-[#e6ece2] text-[#0a2e1c]">02</span>
                <h3 className="text-lg font-black text-[#0a2e1c]">Keep the route human</h3>
                <p className="text-xs text-[#576b5d] leading-relaxed">
                  The Trekker portal is designed as an outdoor cockpit, not a clinical monitor.
                </p>
              </article>

              <article className="p-6 rounded-2xl bg-[#0a2e1c] text-[#f7f5f0] border border-[#14462c] shadow-sm hover:shadow-md transition-all space-y-3">
                <span className="inline-block text-xs font-black px-2.5 py-1 rounded-md bg-[#14462c] text-[#86efac]">03</span>
                <h3 className="text-lg font-black text-white">Send useful context</h3>
                <p className="text-xs text-[#cbd7ce] leading-relaxed">
                  An SOS packages the latest persisted signal and location for the response team.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* Section 2: Bento Capabilities (Matching Image 1 & 2) */}
        <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-[#d8ded4]" id="capabilities">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <div className="space-y-3 max-w-xl">
              <p className="text-xs font-black uppercase tracking-widest text-[#4d6655]">Field capabilities</p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#0a2e1c] tracking-tight">
                A safety system that says what it knows.
              </h2>
            </div>
            <p className="text-sm font-medium text-[#576b5d] max-w-md">
              MORAINE surfaces only data that its connected device, phone, and existing response workflow actually provide.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {capabilityTiles.map((tile) => (
              <article
                key={tile.title}
                className="group relative p-7 rounded-3xl bg-white border border-[#d8ded4] shadow-sm hover:shadow-xl hover:border-[#9dbca5] transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-black text-[#758a7b]">{tile.number}</span>
                    <span className="text-[10px] uppercase font-extrabold px-2.5 py-0.5 rounded-full bg-[#f0f4ee] text-[#2c4736] border border-[#d6e0d3]">
                      {tile.tag}
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-[#0a2e1c] group-hover:text-[#14532d] transition-colors">
                    {tile.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#576b5d] mt-2 leading-relaxed font-medium">
                    {tile.detail}
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-[#edf1ea] flex items-center justify-between text-xs font-bold text-[#0a2e1c]">
                  <span>Telemetry Standard</span>
                  <span className="text-[#14532d] font-black">{tile.highlight}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Section 3: How It Works Visual Flow (Matching Image 2) */}
        <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-[#d8ded4]" id="how-it-works">
          <div className="space-y-3 mb-12">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#0a2e1c] tracking-tight">
              How It Works
            </h2>
            <p className="text-sm font-medium text-[#576b5d] max-w-2xl">
              From wearable sensor tracking to authorized emergency coordination in one continuous safety loop.
            </p>
          </div>

          {/* Connected Flow Sequence */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 lg:gap-6 items-center">
            {/* Step 1: Trekker */}
            <div className="p-6 rounded-3xl bg-white border border-[#d8ded4] shadow-sm hover:shadow-md transition-all flex flex-col items-center text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-[#f0f4ee] border border-[#d6e0d3] flex items-center justify-center text-[#0a2e1c]">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <strong className="block text-base font-black text-[#0a2e1c]">Trekker</strong>
                <span className="block text-xs text-[#576b5d] font-medium mt-0.5">Equipped on route</span>
              </div>
            </div>

            {/* Step 2: Safety Device */}
            <div className="p-6 rounded-3xl bg-white border border-[#d8ded4] shadow-sm hover:shadow-md transition-all flex flex-col items-center text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-[#f0f4ee] border border-[#d6e0d3] flex items-center justify-center text-[#0a2e1c]">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <rect x="6" y="4" width="12" height="16" rx="4" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 2h.01M9 2h6M9 22h6" />
                </svg>
              </div>
              <div>
                <strong className="block text-base font-black text-[#0a2e1c]">Safety Device</strong>
                <span className="block text-xs text-[#576b5d] font-medium mt-0.5">Sensors &amp; Barometrics</span>
              </div>
            </div>

            {/* Step 3: BLE Bridge */}
            <div className="p-6 rounded-3xl bg-white border border-[#d8ded4] shadow-sm hover:shadow-md transition-all flex flex-col items-center text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-[#f0f4ee] border border-[#d6e0d3] flex items-center justify-center text-[#0a2e1c]">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 6.5l11 11L12 23V1l5.5 5.5-11 11" />
                </svg>
              </div>
              <div>
                <strong className="block text-base font-black text-[#0a2e1c]">BLE Bridge</strong>
                <span className="block text-xs text-[#576b5d] font-medium mt-0.5">Local Peer Sync</span>
              </div>
            </div>

            {/* Step 4: Platform */}
            <div className="p-6 rounded-3xl bg-white border border-[#d8ded4] shadow-sm hover:shadow-md transition-all flex flex-col items-center text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-[#f0f4ee] border border-[#d6e0d3] flex items-center justify-center text-[#0a2e1c]">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
              </div>
              <div>
                <strong className="block text-base font-black text-[#0a2e1c]">Platform</strong>
                <span className="block text-xs text-[#576b5d] font-medium mt-0.5">Honest State Engine</span>
              </div>
            </div>

            {/* Step 5: Responder */}
            <div className="col-span-2 sm:col-span-1 p-6 rounded-3xl bg-[#0a2e1c] text-[#f7f5f0] border border-[#14462c] shadow-md hover:shadow-lg transition-all flex flex-col items-center text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-[#14462c] border border-[#1e613d] flex items-center justify-center text-[#86efac]">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
                </svg>
              </div>
              <div>
                <strong className="block text-base font-black text-white">Responder</strong>
                <span className="block text-xs text-[#cbd7ce] font-medium mt-0.5">Triage &amp; Rescue</span>
              </div>
            </div>
          </div>

          {/* Live Safety Telemetry Strip (Matching Image 2) */}
          <div className="mt-16 space-y-6">
            <h3 className="text-2xl sm:text-3xl font-black text-[#0a2e1c] tracking-tight">
              Live Safety Telemetry
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {/* Telemetry Card 1: Altitude */}
              <div className="p-5 rounded-2xl bg-white border border-[#d8ded4] shadow-sm flex flex-col justify-between space-y-3">
                <div className="w-10 h-10 rounded-xl bg-[#0a2e1c] text-[#f7f5f0] flex items-center justify-center text-sm font-bold shadow-sm">
                  ▲
                </div>
                <div>
                  <span className="block text-xs text-[#576b5d] font-bold">Current Altitude</span>
                  <strong className="block text-xl sm:text-2xl font-black text-[#0a2e1c] mt-0.5 tabular-nums">
                    4,250m
                  </strong>
                </div>
              </div>

              {/* Telemetry Card 2: Heart Rate */}
              <div className="p-5 rounded-2xl bg-white border border-[#d8ded4] shadow-sm flex flex-col justify-between space-y-3">
                <div className="w-10 h-10 rounded-xl bg-[#0a2e1c] text-[#f87171] flex items-center justify-center text-base font-bold shadow-sm">
                  ♥
                </div>
                <div>
                  <span className="block text-xs text-[#576b5d] font-bold">Heart Rate</span>
                  <strong className="block text-xl sm:text-2xl font-black text-[#0a2e1c] mt-0.5 tabular-nums flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#22c55e]" />
                    78 BPM
                  </strong>
                </div>
              </div>

              {/* Telemetry Card 3: SpO2 */}
              <div className="p-5 rounded-2xl bg-white border border-[#d8ded4] shadow-sm flex flex-col justify-between space-y-3">
                <div className="w-10 h-10 rounded-xl bg-[#0a2e1c] text-[#60a5fa] flex items-center justify-center text-sm font-bold shadow-sm">
                  💧
                </div>
                <div>
                  <span className="block text-xs text-[#576b5d] font-bold">SpO2</span>
                  <strong className="block text-xl sm:text-2xl font-black text-[#0a2e1c] mt-0.5 tabular-nums">
                    96%
                  </strong>
                </div>
              </div>

              {/* Telemetry Card 4: Pressure */}
              <div className="p-5 rounded-2xl bg-white border border-[#d8ded4] shadow-sm flex flex-col justify-between space-y-3">
                <div className="w-10 h-10 rounded-xl bg-[#0a2e1c] text-[#facc15] flex items-center justify-center text-sm font-bold shadow-sm">
                  ⏱
                </div>
                <div>
                  <span className="block text-xs text-[#576b5d] font-bold">Atmospheric Pressure</span>
                  <strong className="block text-xl sm:text-2xl font-black text-[#0a2e1c] mt-0.5 tabular-nums">
                    650 hPa
                  </strong>
                </div>
              </div>

              {/* Telemetry Card 5: Fall Detection */}
              <div className="col-span-2 sm:col-span-1 p-5 rounded-2xl bg-white border border-[#d8ded4] shadow-sm flex flex-col justify-between space-y-3">
                <div className="w-10 h-10 rounded-xl bg-[#0a2e1c] text-[#86efac] flex items-center justify-center text-sm font-bold shadow-sm">
                  ✓
                </div>
                <div>
                  <span className="block text-xs text-[#576b5d] font-bold">Fall Detection</span>
                  <strong className="block text-sm sm:text-base font-black text-[#0a2e1c] mt-1 flex items-center gap-1.5">
                    Status: Normal <span className="text-[#22c55e]">✓</span>
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 4: Hardware Showcase (Matching Image 1) */}
        <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-[#d8ded4]" id="hardware">
          <div className="bg-[#f7f5f0] rounded-3xl p-8 sm:p-12 lg:p-14 border-2 border-[#0a2e1c] shadow-lg relative overflow-hidden">
            {/* Tactical Corner Accents */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-[#0a2e1c]" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-[#0a2e1c]" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-[#0a2e1c]" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-[#0a2e1c]" />

            <div className="space-y-6">
              <h2 className="text-3xl sm:text-4xl font-black text-[#0a2e1c] tracking-tight">
                Built for the trail.
              </h2>

              {/* Real Hardware Photo Display */}
              <div className="relative w-full h-64 sm:h-96 md:h-[420px] rounded-2xl overflow-hidden border border-[#14462c] shadow-2xl bg-[#0a2e1c]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/argus-hardware.jpg"
                  alt="MORAINE ESP32 expedition wearable displaying real-time OLED Trek Stats (Start Alt, Current Alt, Gain, Speed, Distance) and optical biometric sensor"
                  className="w-full h-full object-cover object-center transform hover:scale-105 transition-transform duration-500"
                />
                
                {/* Real-time Telemetry Overlay Tag */}
                <div className="absolute bottom-3 left-3 right-3 sm:left-4 sm:right-auto sm:bottom-4 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#0a2e1c]/90 backdrop-blur-md text-[#f7f5f0] border border-[#23583b] text-xs font-bold shadow-lg">
                  <span className="w-2 h-2 rounded-full bg-[#22c55e] animate-ping" />
                  <span>MORAINE ESP32 Hardware &middot; Live OLED Trek Stats &amp; Sensor</span>
                  <span className="ml-1 text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-[#14442a] text-[#86efac] border border-[#1b5034]">
                    Initial Prototype
                  </span>
                </div>
              </div>

              <div className="text-center space-y-1.5 pt-1">
                <span className="inline-block text-[11px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-[#e6ece2] text-[#1e442c] border border-[#cbd7c7]">
                  Initial Prototype Version
                </span>
                <p className="text-xs sm:text-sm font-bold text-[#0a2e1c]">
                  Ruggedized, BLE-enabled wearable providing continuous safety telemetry.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 5: Cave Rescue Support (Matching Image 1) */}
        <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-[#d8ded4]" id="cave-rescue">
          <div className="space-y-8">
            <div className="space-y-3 max-w-2xl">
              <h2 className="text-3xl sm:text-4xl font-black text-[#0a2e1c] tracking-tight">
                Cave Rescue Support
              </h2>
              <p className="text-sm font-medium text-[#576b5d] leading-relaxed">
                For cave explorers and rescue teams, MORAINE carries available device telemetry, SOS state, and responder coordination without claiming underground GPS where no signal exists.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="p-5 rounded-2xl bg-white border border-[#d8ded4] shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#0a2e1c] text-[#f7f5f0] flex items-center justify-center text-xl shrink-0">
                  👤
                </div>
                <div>
                  <strong className="block text-sm sm:text-base font-black text-[#0a2e1c]">
                    Cave Expedition Profiles
                  </strong>
                  <span className="block text-xs text-[#576b5d] font-medium mt-0.5">
                    Pre-trip route baseline
                  </span>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-white border border-[#d8ded4] shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#0a2e1c] text-[#f7f5f0] flex items-center justify-center text-xl shrink-0">
                  📍
                </div>
                <div>
                  <strong className="block text-sm sm:text-base font-black text-[#0a2e1c]">
                    Last Known Location Tracking
                  </strong>
                  <span className="block text-xs text-[#576b5d] font-medium mt-0.5">
                    Entrance &amp; surface fix
                  </span>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-white border border-[#d8ded4] shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#0a2e1c] text-[#f7f5f0] flex items-center justify-center text-xl shrink-0">
                  📞
                </div>
                <div>
                  <strong className="block text-sm sm:text-base font-black text-[#0a2e1c]">
                    Structured SOS for Spelunkers
                  </strong>
                  <span className="block text-xs text-[#576b5d] font-medium mt-0.5">
                    Direct dispatch packet
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 6: Responder Story & Questions */}
        <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-[#d8ded4]" id="for-responders">
          <div className="bg-[#123020] rounded-3xl p-8 sm:p-12 lg:p-16 text-[#f7f5f0] shadow-2xl relative overflow-hidden topo-contour-dark">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center relative z-10">
              <div className="lg:col-span-6 space-y-5">
                <p className="text-xs font-black uppercase tracking-widest text-[#86efac]">Responder command center</p>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
                  A signal becomes useful information.
                </h2>
                <p className="text-sm sm:text-base text-[#cbd7ce] leading-relaxed font-medium">
                  Authorized teams can quickly orient around the operational questions that matter: who needs help, where they were last detected, what happened, when the last signal arrived, and what is currently available.
                </p>
                <div className="pt-2">
                  <Link
                    className="inline-flex items-center justify-center px-6 py-3.5 rounded-xl font-black text-sm text-[#0a2e1c] bg-[#f7f5f0] hover:bg-white transition-all shadow-md active:scale-95"
                    href="/responder/login"
                  >
                    Responder sign in →
                  </Link>
                </div>
              </div>

              <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-[#1a442d]/80 border border-[#23583b]">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#86efac]">WHO</span>
                  <strong className="block text-sm font-black text-white mt-1">Authorized trekker record</strong>
                </div>
                <div className="p-4 rounded-2xl bg-[#1a442d]/80 border border-[#23583b]">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#86efac]">WHERE</span>
                  <strong className="block text-sm font-black text-white mt-1">Latest available location</strong>
                </div>
                <div className="p-4 rounded-2xl bg-[#1a442d]/80 border border-[#23583b]">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#86efac]">WHAT</span>
                  <strong className="block text-sm font-black text-white mt-1">SOS, fall, or device context</strong>
                </div>
                <div className="p-4 rounded-2xl bg-[#1a442d]/80 border border-[#23583b]">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#86efac]">WHEN</span>
                  <strong className="block text-sm font-black text-white mt-1">Signal &amp; event timestamps</strong>
                </div>
                <div className="sm:col-span-2 p-4 rounded-2xl bg-[#1a442d]/80 border border-[#23583b]">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#86efac]">STATUS</span>
                  <strong className="block text-sm font-black text-white mt-1">Current response &amp; notification state</strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 7: Portal Selection */}
        <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-[#d8ded4]" id="for-trekkers">
          <div className="text-center max-w-xl mx-auto space-y-3 mb-12">
            <p className="text-xs font-black uppercase tracking-widest text-[#4d6655]">Choose your portal</p>
            <h2 className="text-3xl sm:text-4xl font-black text-[#0a2e1c] tracking-tight">
              One system. Two distinct field experiences.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <Link
              href="/user/login"
              className="group p-8 rounded-3xl bg-white border border-[#d8ded4] shadow-sm hover:shadow-xl hover:border-[#0a2e1c] transition-all flex flex-col justify-between"
            >
              <div className="space-y-2">
                <span className="text-xs font-black uppercase tracking-widest text-[#4d6655]">TREKKER</span>
                <h3 className="text-2xl font-black text-[#0a2e1c] group-hover:translate-x-1 transition-transform">
                  Expedition cockpit →
                </h3>
                <p className="text-xs sm:text-sm text-[#576b5d] font-medium">
                  Device, route, telemetry, safety and SOS
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-[#edf1ea] text-xs font-bold text-[#0a2e1c]">
                Open Trekker Account &amp; Cockpit
              </div>
            </Link>

            <Link
              href="/responder/login"
              className="group p-8 rounded-3xl bg-[#0a2e1c] text-[#f7f5f0] border border-[#14462c] shadow-md hover:shadow-xl hover:border-[#86efac] transition-all flex flex-col justify-between"
            >
              <div className="space-y-2">
                <span className="text-xs font-black uppercase tracking-widest text-[#86efac]">RESPONDER</span>
                <h3 className="text-2xl font-black text-white group-hover:translate-x-1 transition-transform">
                  Command center →
                </h3>
                <p className="text-xs sm:text-sm text-[#cbd7ce] font-medium">
                  Cases, signals, location and coordination
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-[#14462c] text-xs font-bold text-[#86efac]">
                Authorized Responder Sign In
              </div>
            </Link>
          </div>
        </section>

        {/* Section 8: Creators */}
        <section className="py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-[#d8ded4] text-center space-y-2">
          <p className="text-xs font-black uppercase tracking-widest text-[#4d6655]">Creators</p>
          <strong className="block text-2xl font-black text-[#0a2e1c]">
            Sarbagya &middot; Ayush &middot; Michael &middot; Raunak
          </strong>
          <span className="block text-xs font-bold text-[#576b5d]">
            MORAINE &middot; Trekker Safety &amp; Emergency Response
          </span>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}

