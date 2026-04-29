import { getTranslations } from "next-intl/server"
import { ChevronDown } from "lucide-react"

const HERO_STATS = [
  { valueKey: "heroStatMembersValue", labelKey: "heroStatMembersLabel" },
  { valueKey: "heroStatSchoolsValue", labelKey: "heroStatSchoolsLabel" },
  { valueKey: "heroStatScriptsValue", labelKey: "heroStatScriptsLabel" },
  { valueKey: "heroStatMatchValue", labelKey: "heroStatMatchLabel" },
] as const

export async function HeroSection() {
  const t = await getTranslations("home")

  return (
    <section id="top" className="relative overflow-hidden bg-[#f2f0eb] px-5 pb-14 pt-28 grain-overlay md:pb-20 md:pt-32">
      <div className="container relative z-10 mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="font-display text-4xl font-bold leading-[1.08] tracking-wide text-[#13241d] sm:text-5xl lg:text-7xl">
            {t("heroTitle")}
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-[1.85] text-muted-foreground sm:text-lg">
            {t("heroSubtitle")}
          </p>
        </div>

        <div className="mx-auto mt-9 grid max-w-3xl grid-cols-2 gap-3">
          {HERO_STATS.map((stat) => (
            <div key={stat.labelKey} className="rounded-2xl border border-[#d9d1c1] bg-white/76 p-4 text-left shadow-[0_10px_28px_rgba(35,27,16,0.05)] sm:p-5">
              <p className="font-display text-3xl font-bold leading-none text-[#1E3932]">{t(stat.valueKey)}</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">{t(stat.labelKey)}</p>
            </div>
          ))}
        </div>
      </div>

      <a
        href="#about"
        className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2 text-[#1E3932]/35 animate-bounce-down"
        aria-label={t("heroScrollLabel")}
      >
        <ChevronDown size={24} />
      </a>
    </section>
  )
}
