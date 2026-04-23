import { getTranslations } from "next-intl/server"
import { BambooLeaves } from "@/components/landing/BambooLeaves"
import { LandingNav } from "@/components/landing/LandingNav"
import { HeroSection } from "@/components/landing/HeroSection"
import { ActivityPreviewSection } from "@/components/landing/ActivityPreviewSection"
import { MissionSection } from "@/components/landing/MissionSection"
import { CommunityProofSection } from "@/components/landing/CommunityProofSection"
import { StaffSection } from "@/components/landing/StaffSection"
import { TestimonialsSection } from "@/components/landing/TestimonialsSection"
import { FaqSection } from "@/components/landing/FaqSection"
import { ContactSection } from "@/components/landing/ContactSection"
import { LandingFooter } from "@/components/landing/LandingFooter"
import { OrigamiCraneLauncher } from "@/components/landing/OrigamiCraneLauncher"

export default async function HomePage() {
  const t = await getTranslations("home")

  return (
    <>
      <BambooLeaves />
      <LandingNav />
      <main>
        <HeroSection />
        <ActivityPreviewSection />
        <MissionSection />
        <CommunityProofSection />
        <StaffSection />
        <TestimonialsSection />
        <FaqSection />
        <ContactSection />
      </main>
      <LandingFooter />
      <OrigamiCraneLauncher
        ariaLabel={t("craneAriaLabel")}
        bubbleLabel={t("craneBubble")}
        title={t("craneTitle")}
        subtitle={t("craneSubtitle")}
        replayLabel={t("craneReplay")}
        closeLabel={t("craneClose")}
        activitiesLabel={t("craneActivities")}
      />
    </>
  )
}
