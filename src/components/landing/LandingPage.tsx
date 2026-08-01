import { EmergencyJourney } from "./EmergencyJourney";
import { HeroSection } from "./HeroSection";
import { LandingFooter } from "./LandingFooter";
import { LandingHeader } from "./LandingHeader";
import { PortalSection } from "./PortalSection";
import { ProductStory } from "./ProductStory";
import { RescueSnapshot } from "./RescueSnapshot";
import { SystemFlow } from "./SystemFlow";

export function LandingPage() {
  return (
    <main className="land-page" id="land-content">
      <a className="land-skip-link" href="#land-content">
        Skip to content
      </a>
      <LandingHeader />
      <HeroSection />
      <ProductStory />
      <SystemFlow />
      <EmergencyJourney />
      <RescueSnapshot />
      <PortalSection />
      <LandingFooter />
    </main>
  );
}
