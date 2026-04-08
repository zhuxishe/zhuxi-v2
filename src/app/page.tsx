import { IntroOverlay } from "@/components/landing/IntroOverlay"
import { BambooLeaves } from "@/components/landing/BambooLeaves"
import { LandingNav } from "@/components/landing/LandingNav"
import { HeroSection } from "@/components/landing/HeroSection"
import { MissionSection } from "@/components/landing/MissionSection"
import { ScriptsSection } from "@/components/landing/ScriptsSection"
import { TestimonialsSection } from "@/components/landing/TestimonialsSection"
import { FaqSection } from "@/components/landing/FaqSection"
import { ContactSection } from "@/components/landing/ContactSection"
import { LandingFooter } from "@/components/landing/LandingFooter"

export default function HomePage() {
  return (
    <>
      <IntroOverlay />
      <BambooLeaves />
      <LandingNav />
      <main>
        <HeroSection />
        <MissionSection />
        <ScriptsSection />
        <TestimonialsSection />
        <FaqSection />
        <ContactSection />
      </main>
      <LandingFooter />
    </>
  )
}
