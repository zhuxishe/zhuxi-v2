import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { BambooLeaves } from "@/components/landing/BambooLeaves"
import { LandingFooter } from "@/components/landing/LandingFooter"
import { LandingNav } from "@/components/landing/LandingNav"
import { CollectiveSocialClassRail } from "@/components/landing/collective-social/CollectiveSocialClassRail"
import { CollectiveSocialClosing } from "@/components/landing/collective-social/CollectiveSocialClosing"
import { CollectiveSocialHero } from "@/components/landing/collective-social/CollectiveSocialHero"
import { CollectiveSocialManifesto } from "@/components/landing/collective-social/CollectiveSocialManifesto"
import { CollectiveSocialModel } from "@/components/landing/collective-social/CollectiveSocialModel"
import { CollectiveSocialTimeline } from "@/components/landing/collective-social/CollectiveSocialTimeline"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("collectiveSocial")
  return { title: t("metadataTitle"), description: t("metadataDescription") }
}

export default function CollectiveSocialPage() {
  return (
    <>
      <div className="hidden sm:block">
        <BambooLeaves />
      </div>
      <LandingNav />
      <main className="relative overflow-hidden bg-[#fffdf7] text-[#171d15] grain-overlay">
        <CollectiveSocialHero />
        <CollectiveSocialManifesto />
        <CollectiveSocialModel />
        <CollectiveSocialClassRail />
        <CollectiveSocialTimeline />
        <CollectiveSocialClosing />
      </main>
      <LandingFooter />
    </>
  )
}
