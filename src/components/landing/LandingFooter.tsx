import Link from "next/link";
import { BrandLogo } from "@/components/shared/brand-logo";

export function LandingFooter() {
  return (
    <footer className="w-full border-t border-[#ccd8c7] bg-[#e6ece2] topo-contour-cream text-[#10291e] py-16 px-6 lg:px-12 mt-16">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-10">
        {/* Brand Column */}
        <div className="lg:col-span-2 space-y-4">
          <BrandLogo size="lg" />
          <p className="text-sm text-[#405b4a] max-w-sm leading-relaxed">
            Himalayan Trekker Safety &amp; Emergency Response Platform with secondary Cave Rescue support. Engineered for field reliability.
          </p>
        </div>

        {/* Platform Links */}
        <div className="space-y-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-[#577060]">Platform</h3>
          <ul className="space-y-2 text-sm font-medium text-[#2d4737]">
            <li><a href="#platform" className="hover:text-[#0a2e1c] transition-colors">Explore features</a></li>
            <li><a href="#hardware" className="hover:text-[#0a2e1c] transition-colors">Hardware specs</a></li>
            <li><a href="#how-it-works" className="hover:text-[#0a2e1c] transition-colors">Safety protocols</a></li>
            <li><a href="#cave-rescue" className="hover:text-[#0a2e1c] transition-colors">Cave rescue</a></li>
          </ul>
        </div>

        {/* Portals Links */}
        <div className="space-y-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-[#577060]">Portals</h3>
          <ul className="space-y-2 text-sm font-medium text-[#2d4737]">
            <li><Link href="/user/login" className="hover:text-[#0a2e1c] transition-colors">Trekker Portal</Link></li>
            <li><Link href="/responder/login" className="hover:text-[#0a2e1c] transition-colors">Responder Command</Link></li>
          </ul>
          <h3 className="text-xs font-black uppercase tracking-widest text-[#577060] pt-2">Policies</h3>
          <ul className="space-y-2 text-sm font-medium text-[#2d4737]">
            <li><span className="text-[#577060]">Privacy Policy</span></li>
            <li><span className="text-[#577060]">Terms of Service</span></li>
          </ul>
        </div>

        {/* Creator & LinkedIn Card (Matching Reference Image 2) */}
        <div className="lg:col-span-2 flex flex-col justify-between">
          <div className="bg-[#f7f5f0] border border-[#cbd6ca] rounded-xl p-5 shadow-sm space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-[#577060]">Platform Architect</div>
            <div className="text-base font-extrabold text-[#0a2e1c]">
              Creator: Sarbagya Acharya
            </div>
            <div className="pt-1">
              <a
                href="https://www.linkedin.com/in/sarbagya-acharya/"
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2.5 px-4 py-2 bg-[#0077B5] hover:bg-[#005e93] text-white font-bold text-xs rounded-lg shadow transition-all transform hover:-translate-y-0.5"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                </svg>
                <span>Connect on LinkedIn</span>
              </a>
            </div>
          </div>
          <div className="text-xs text-[#577060] pt-4">
            Copyright &copy; {new Date().getFullYear()} MORAINE / Sarbagya Acharya. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
}
