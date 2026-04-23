import { getTranslations } from "next-intl/server"
import { BambooLeaves } from "@/components/landing/BambooLeaves"
import { LandingFooter } from "@/components/landing/LandingFooter"
import { LandingNav } from "@/components/landing/LandingNav"
import { StaffSection } from "@/components/landing/StaffSection"

export default async function OrganizationPage() {
  const t = await getTranslations("organization")

  return (
    <>
      <BambooLeaves />
      <LandingNav />
      <main className="bg-[#f2f0eb] px-5 pb-20 pt-28 md:pt-32">
        <section className="container mx-auto max-w-5xl">
          <div className="rounded-[2.4rem] border border-[#dcd3c4] bg-white/75 px-8 py-12 shadow-[0_18px_54px_rgba(35,27,16,0.08)] backdrop-blur-xl md:px-12">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-bamboo">
              {t("kicker")}
            </p>
            <h1 className="mt-4 max-w-3xl font-display text-4xl font-bold leading-[1.12] text-[#13241d] md:text-6xl">
              {t("title")}
            </h1>
            <p className="mt-6 max-w-3xl text-sm leading-[1.95] text-muted-foreground md:text-base">
              {t("subtitle")}
            </p>
          </div>
        </section>

        <StaffSection
          id="team"
          kicker={t("teamKicker")}
          title={t("teamTitle")}
          subtitle={t("teamSubtitle")}
        />
      </main>
      <LandingFooter />
    </>
  )
}
