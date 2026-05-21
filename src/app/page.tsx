import { LandingNav } from "@/components/landing/LandingNav"
import { HeroSection } from "@/components/landing/HeroSection"
import { SchoolDistributionSection } from "@/components/landing/SchoolDistributionSection"
import { LandingFooter } from "@/components/landing/LandingFooter"

export default function HomePage() {
  return (
    <>
      <LandingNav />
      <main>
        <HeroSection />
        <SchoolDistributionSection />
      </main>
      <LandingFooter />
    </>
  )
}
