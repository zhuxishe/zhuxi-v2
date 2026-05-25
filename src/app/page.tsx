import { LandingNav } from "@/components/landing/LandingNav"
import { HeroSection } from "@/components/landing/HeroSection"
import { LandingFooter } from "@/components/landing/LandingFooter"
import { HomeTearEasterEgg } from "@/components/landing/HomeTearEasterEgg"

export default function HomePage() {
  return (
    <HomeTearEasterEgg>
      <LandingNav />
      <main>
        <HeroSection />
      </main>
      <LandingFooter />
    </HomeTearEasterEgg>
  )
}
