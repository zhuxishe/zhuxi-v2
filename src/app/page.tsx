import { LandingNav } from "@/components/landing/LandingNav"
import { HeroSection } from "@/components/landing/HeroSection"
import { MissionSection } from "@/components/landing/MissionSection"
import { ScriptsSection } from "@/components/landing/ScriptsSection"
import { TeamSection } from "@/components/landing/TeamSection"
import { TestimonialsSection } from "@/components/landing/TestimonialsSection"
import { FaqSection } from "@/components/landing/FaqSection"
import { ContactSection } from "@/components/landing/ContactSection"
import { LandingFooter } from "@/components/landing/LandingFooter"

export default function HomePage() {
  return (
    <>
      <LandingNav />
      <main>
        <HeroSection />
        <MissionSection />
        <ScriptsSection />
        <TeamSection />
        <TestimonialsSection />
        <FaqSection />
        <ContactSection />
      </main>
      <LandingFooter />
    </>
  )
}
