import { getTranslations } from "next-intl/server"
import { BrandFilmCard } from "./BrandFilmCard"

export async function BrandMotionSection() {
  const t = await getTranslations("home")

  return (
    <section id="story" className="relative bg-[#f2f0eb] px-5 py-16 md:py-24">
      <div className="container mx-auto max-w-6xl">
        <BrandFilmCard
          playLabel={t("storyPlay")}
          replayLabel={t("storyReplay")}
          posterTitle={t("storyPosterTitle")}
          posterSubtitle={t("storyPosterSubtitle")}
        />

        <div className="mx-auto mt-8 max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-bamboo">
            {t("storyKicker")}
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold leading-tight md:text-4xl">
            {t("storyTitle")}
          </h2>
          <p className="mt-4 text-sm leading-[1.9] text-muted-foreground md:text-base">
            {t("storySubtitle")}
          </p>
          <p className="mt-5 rounded-2xl bg-white/70 p-5 text-sm leading-[1.8] text-foreground/78 shadow-[0_10px_28px_rgba(35,27,16,0.05)]">
            {t("storyNote")}
          </p>
        </div>
      </div>
    </section>
  )
}
