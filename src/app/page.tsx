import { LandingNav } from "@/components/landing/LandingNav"
import { HeroSection } from "@/components/landing/HeroSection"
import { HomeActivityStrip } from "@/components/landing/HomeActivityStrip"
import { SchoolDistributionSection } from "@/components/landing/SchoolDistributionSection"
import { LandingFooter } from "@/components/landing/LandingFooter"

export default function HomePage() {
  return (
    <>
      <LandingNav />
      <main>
        <HeroSection />
        <SchoolDistributionSection />
        <HomeActivityStrip />
      </main>
      <LandingFooter />
    </>
  )
}
