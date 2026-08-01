import { DemoMedia } from "./DemoMedia";
import { HeroSection } from "./HeroSection";
import { LandingFooter } from "./LandingFooter";
import { LandingHeader } from "./LandingHeader";
import { PortalSection } from "./PortalSection";
import { PrototypeRoadmap } from "./PrototypeRoadmap";
import { RescueSnapshot } from "./RescueSnapshot";
import { SosFlow } from "./SosFlow";
import { SystemFlow } from "./SystemFlow";
import { TourismProblem } from "./TourismProblem";

export function LandingPage() {
  return (
    <div className="land-page">
      <a className="land-skip-link" href="#main-content">Skip to main content</a>
      <LandingHeader />
      <main id="main-content">
        <HeroSection />
        <TourismProblem />
        <SystemFlow />
        <DemoMedia />
        <SosFlow />
        <RescueSnapshot />
        <PrototypeRoadmap />
        <PortalSection />
      </main>
      <LandingFooter />
    </div>
  );
}
