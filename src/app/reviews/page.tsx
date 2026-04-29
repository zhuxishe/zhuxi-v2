import { BambooLeaves } from "@/components/landing/BambooLeaves"
import { LandingFooter } from "@/components/landing/LandingFooter"
import { LandingNav } from "@/components/landing/LandingNav"
import { PastReviewsSection } from "@/components/landing/PastReviewsSection"

export default function PastReviewsPage() {
  return (
    <>
      <BambooLeaves />
      <LandingNav />
      <main>
        <PastReviewsSection />
      </main>
      <LandingFooter />
    </>
  )
}
