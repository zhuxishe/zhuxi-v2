import { IntroOverlay } from "@/components/landing/IntroOverlay"
import { BambooLeaves } from "@/components/landing/BambooLeaves"
import { LandingNav } from "@/components/landing/LandingNav"
import { HeroSection } from "@/components/landing/HeroSection"
import { ActivityPreviewSection } from "@/components/landing/ActivityPreviewSection"
import { MissionSection } from "@/components/landing/MissionSection"
import { StaffSection } from "@/components/landing/StaffSection"
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
        <ActivityPreviewSection />
        <MissionSection />
        <StaffSection />
        <TestimonialsSection />
        <FaqSection />
        <ContactSection />
      </main>
      <LandingFooter />
    </>
  )
}
