import { LandingNav } from "@/components/landing/LandingNav"
import { HeroSection } from "@/components/landing/HeroSection"
import { SchoolStatsSection } from "@/components/landing/SchoolStatsSection"
import { LandingFooter } from "@/components/landing/LandingFooter"

export default function HomePage() {
  return (
    <>
      <LandingNav />
      <main>
        <HeroSection />
        <SchoolStatsSection />
      </main>
      <LandingFooter />
    </>
  )
}
