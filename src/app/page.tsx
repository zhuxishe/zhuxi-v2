import { getTranslations } from "next-intl/server"
import { BambooLeaves } from "@/components/landing/BambooLeaves"
import { LandingNav } from "@/components/landing/LandingNav"
import { HeroSection } from "@/components/landing/HeroSection"
import { AboutIntroSection } from "@/components/landing/AboutIntroSection"
import { MissionSection } from "@/components/landing/MissionSection"
import { FaqSection } from "@/components/landing/FaqSection"
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
        <AboutIntroSection />
        <MissionSection />
        <FaqSection />
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
