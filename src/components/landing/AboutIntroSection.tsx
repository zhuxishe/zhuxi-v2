import { getTranslations } from "next-intl/server"

export async function AboutIntroSection() {
  const t = await getTranslations("home")

  return (
    <section id="about" className="relative bg-[#fbf8f1] px-5 py-14 md:py-20">
      <div className="container mx-auto max-w-5xl">
        <div className="rounded-[2rem] border border-[#ded5c5] bg-white/78 p-7 shadow-[0_16px_44px_rgba(35,27,16,0.07)] md:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-bamboo">
            {t("aboutIntroKicker")}
          </p>
          <h2 className="mt-3 font-display text-2xl font-bold leading-tight text-[#13241d] md:text-4xl">
            {t("aboutIntroTitle")}
          </h2>
          <p className="mt-5 text-sm leading-[1.9] text-muted-foreground md:text-base">
            {t("aboutIntroBody")}
          </p>
        </div>
      </div>
    </section>
  )
}
