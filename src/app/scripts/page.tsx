import { BambooLeaves } from "@/components/landing/BambooLeaves"
import { LandingFooter } from "@/components/landing/LandingFooter"
import { LandingNav } from "@/components/landing/LandingNav"
import { ScriptsSection } from "@/components/landing/ScriptsSection"

export default function PublicScriptsPage() {
  return (
    <>
      <BambooLeaves />
      <LandingNav />
      <main>
        <ScriptsSection />
      </main>
      <LandingFooter />
    </>
  )
}
