import Link from "next/link";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden py-16 sm:py-24 lg:py-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto" aria-labelledby="hero-title">
      {/* Background Topographic Ambient Glow */}
      <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 rounded-full bg-[#e6ece2] blur-3xl opacity-60 pointer-events-none" />
      <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-96 h-96 rounded-full bg-[#edf2e8] blur-3xl opacity-60 pointer-events-none" />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center relative z-10">
        {/* Left Column: Copy & Actions */}
        <div className="lg:col-span-7 space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#e6ece2] text-[#0a2e1c] border border-[#cbd7c7] text-xs font-black uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-[#0a2e1c] animate-pulse" />
            <span>Trekker safety + emergency response</span>
          </div>

          <h1 id="hero-title" className="text-4xl sm:text-5xl lg:text-6xl font-black text-[#0a2e1c] tracking-tight leading-[1.05]">
            Stay connected and protected when the trail becomes unpredictable.
          </h1>

          <p className="text-base sm:text-lg text-[#405b4a] max-w-2xl leading-relaxed font-medium">
            ARGUS helps trekkers carry available device signals, phone location and SOS context into a clear response workflow—without pretending missing data exists.
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <a
              className="inline-flex items-center justify-center px-7 py-3.5 rounded-xl font-extrabold text-sm text-[#f7f5f0] bg-[#0a2e1c] hover:bg-[#123d27] transition-all shadow-md hover:shadow-lg transform active:scale-95"
              href="#platform"
            >
              Explore platform
            </a>
            <Link
              className="inline-flex items-center justify-center px-7 py-3.5 rounded-xl font-extrabold text-sm text-[#0a2e1c] bg-[#e6ece2] hover:bg-[#d9e4d5] border border-[#c5d3c1] transition-all shadow-sm transform active:scale-95"
              href="/user/login"
            >
              Sign in
            </Link>
          </div>

          <p className="text-xs text-[#576b5d] pt-2 flex items-center gap-2">
            <span className="text-[#0a2e1c] font-bold">ℹ</span>
            <span>For safety support and emergency coordination. Always follow local rescue guidance and emergency procedures.</span>
          </p>
        </div>

        {/* Right Column: Hero Instrument & Telemetry Glass Showcase (Matching Image 1 & 2) */}
        <div className="lg:col-span-5 relative">
          <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-[#0a2e1c] to-[#123a25] p-1.5 shadow-2xl border border-[#1d4c32]">
            {/* Topographic Terrain Pattern Overlay */}
            <div className="relative rounded-[22px] overflow-hidden p-6 sm:p-7 text-[#f7f5f0] bg-[#0a2e1c] topo-contour-dark">
              {/* Header Bar */}
              <div className="flex items-center justify-between border-b border-[#1b5034] pb-4 mb-5">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#4ade80] animate-ping" />
                  <span className="text-xs font-black uppercase tracking-widest text-[#92b8a0]">
                    ARGUS / EXPEDITION LINK
                  </span>
                </div>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#14442a] text-[#86efac] border border-[#1b5034]">
                  ● Live Ready
                </span>
              </div>

              {/* Central Status Card */}
              <div className="bg-[#113a24]/90 backdrop-blur-sm border border-[#1b5034] rounded-2xl p-5 mb-5 shadow-inner">
                <div className="flex items-center justify-between text-xs font-bold text-[#92b8a0]">
                  <span>SAFETY STATUS</span>
                  <span className="text-[#f7f5f0] font-black">Himalayan Route</span>
                </div>
                <div className="text-2xl font-black text-white mt-1">
                  Active Expedition Telemetry
                </div>
                <div className="text-xs text-[#cbd7ce] mt-1">
                  Connect an assigned device to begin live sync.
                </div>
              </div>

              {/* 4-Bento Instrument Metrics */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="bg-[#14462c]/80 backdrop-blur-sm border border-[#1f5f3e] rounded-xl p-3.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-[#92b8a0]">
                    <span>ALTITUDE</span>
                    <span>▲</span>
                  </div>
                  <div className="text-xl font-black text-white mt-0.5 tabular-nums">4,250m</div>
                  <div className="text-[10px] text-[#92b8a0] mt-0.5">Barometric Elevation</div>
                </div>

                <div className="bg-[#14462c]/80 backdrop-blur-sm border border-[#1f5f3e] rounded-xl p-3.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-[#92b8a0]">
                    <span>HEART RATE</span>
                    <span className="text-[#f87171]">♥</span>
                  </div>
                  <div className="text-xl font-black text-white mt-0.5 tabular-nums">78 BPM</div>
                  <div className="text-[10px] text-[#92b8a0] mt-0.5">Live Sensor Fix</div>
                </div>

                <div className="bg-[#14462c]/80 backdrop-blur-sm border border-[#1f5f3e] rounded-xl p-3.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-[#92b8a0]">
                    <span>SPO2 OXYGEN</span>
                    <span className="text-[#60a5fa]">💧</span>
                  </div>
                  <div className="text-xl font-black text-white mt-0.5 tabular-nums">96%</div>
                  <div className="text-[10px] text-[#92b8a0] mt-0.5">Optimal Fix</div>
                </div>

                <div className="bg-[#14462c]/80 backdrop-blur-sm border border-[#1f5f3e] rounded-xl p-3.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-[#92b8a0]">
                    <span>SOS BEACON</span>
                    <span className="text-[#4ade80]">⚡</span>
                  </div>
                  <div className="text-xl font-black text-[#4ade80] mt-0.5">Ready</div>
                  <div className="text-[10px] text-[#92b8a0] mt-0.5">Single-Flight Guard</div>
                </div>
              </div>

              {/* Verified Field Display Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-[#1b5034] text-xs">
                <span className="font-bold text-[#92b8a0]">FIELD DISPLAY</span>
                <span className="text-[#f7f5f0] font-semibold text-[11px]">Every field is verified before shown</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
