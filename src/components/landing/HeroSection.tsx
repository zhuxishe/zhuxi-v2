import Image from "next/image"
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
        <div className="relative overflow-hidden rounded-[2.25rem] bg-[#1E3932] p-7 text-white shadow-[0_24px_70px_rgba(30,57,50,0.22)] md:min-h-[690px] md:p-12">
          <Image
            src="/images/landing/campus-panorama.webp"
            alt="Tokyo campus community"
            fill
            priority
            sizes="100vw"
            className="object-cover opacity-[0.34]"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(30,57,50,0.96)_0%,rgba(30,57,50,0.84)_46%,rgba(30,57,50,0.30)_100%)]" />
          <div className="relative z-10 max-w-3xl">
          <div className="flex items-center gap-3">
            <Image src="/logo.svg" alt="" width={46} height={46} loading="eager" className="size-11" />
            <span className="rounded-full bg-white/12 px-4 py-2 text-xs font-semibold tracking-[0.16em] text-white/78">
              {t("heroKicker")}
            </span>
          </div>

          <h1 className="mt-7 font-display text-4xl font-bold leading-[1.05] tracking-wide sm:text-5xl lg:text-7xl">
            {t("heroTitle")}
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-[1.85] text-white/76 sm:text-lg">
            {t("heroSubtitle")}
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a
              href="/scripts"
              className="inline-flex items-center justify-center rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-[#00754A] shadow-[0_8px_16px_rgba(0,0,0,0.14)] transition-all duration-200 hover:bg-[#f2f0eb] active:scale-95"
            >
              {t("heroCta")}
            </a>
            <a
              href="/login?next=/app/matching/survey"
              className="inline-flex items-center justify-center rounded-full border border-white/55 px-7 py-3.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-white hover:text-[#1E3932] active:scale-95"
            >
              {t("heroSecondaryCta")}
            </a>
          </div>
          </div>

          <div className="relative z-10 mt-12 grid gap-3 sm:grid-cols-3 md:absolute md:bottom-10 md:left-12 md:right-12">
            {HERO_STATS.map((stat) => (
              <div key={stat.labelKey} className="rounded-2xl border border-white/12 bg-white/10 p-4">
                <p className="font-display text-2xl font-bold leading-none">{t(stat.valueKey)}</p>
                <p className="mt-2 text-xs leading-relaxed text-white/62">{t(stat.labelKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <a
        href="#activity-preview"
        className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2 text-[#1E3932]/35 animate-bounce-down"
      >
        <ChevronDown size={24} />
      </a>
    </section>
  )
}
