import { getTranslations } from "next-intl/server"
import { ChevronDown } from "lucide-react"

const HERO_STATS = [
  { valueKey: "heroStatMembersValue", labelKey: "heroStatMembersLabel" },
  { valueKey: "heroStatSchoolsValue", labelKey: "heroStatSchoolsLabel" },
  { valueKey: "heroStatModeValue", labelKey: "heroStatModeLabel" },
] as const

export async function HeroSection() {
  const t = await getTranslations("home")

  return (
    <section id="top" className="relative overflow-hidden bg-[#f2f0eb] px-5 pb-16 pt-28 grain-overlay md:pb-24 md:pt-32">
      <div className="container relative z-10 mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="font-display text-4xl font-bold leading-[1.06] tracking-wide text-[#13241d] sm:text-5xl lg:text-7xl">
            {t("heroTitle")}
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-[1.85] text-muted-foreground sm:text-lg">
            {t("heroSubtitle")}
          </p>
        </div>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <a
            href="/scripts"
            className="inline-flex items-center justify-center rounded-full bg-[#00754A] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_8px_16px_rgba(0,0,0,0.14)] transition-all duration-200 hover:bg-[#006241] active:scale-95"
          >
            {t("heroCta")}
          </a>
          <a
            href="/login?next=/app/matching/survey"
            className="inline-flex items-center justify-center rounded-full border border-bamboo px-7 py-3.5 text-sm font-semibold text-bamboo transition-all duration-200 hover:bg-bamboo hover:text-white active:scale-95"
          >
            {t("heroSecondaryCta")}
          </a>
        </div>

        <p className="mx-auto mt-4 max-w-2xl text-center text-sm leading-relaxed text-muted-foreground">
          {t("heroGuide")}
        </p>

        <div className="mx-auto mt-8 grid max-w-4xl gap-3 sm:grid-cols-3">
          {HERO_STATS.map((stat) => (
            <div key={stat.labelKey} className="rounded-2xl border border-[#d9d1c1] bg-white/70 p-4 text-center shadow-[0_10px_28px_rgba(35,27,16,0.05)]">
              <p className="font-display text-2xl font-bold leading-none text-[#1E3932]">{t(stat.valueKey)}</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t(stat.labelKey)}</p>
            </div>
          ))}
        </div>
      </div>

      <a
        href="#mission"
        className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2 text-[#1E3932]/35 animate-bounce-down"
      >
        <ChevronDown size={24} />
      </a>
    </section>
  )
}
