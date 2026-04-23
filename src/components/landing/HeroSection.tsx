import Image from "next/image"
import { getTranslations } from "next-intl/server"
import { CalendarDays, ChevronDown, MapPin, UsersRound } from "lucide-react"

const HERO_STATS = [
  { valueKey: "heroStatMembersValue", labelKey: "heroStatMembersLabel" },
  { valueKey: "heroStatSchoolsValue", labelKey: "heroStatSchoolsLabel" },
  { valueKey: "heroStatModeValue", labelKey: "heroStatModeLabel" },
] as const

export async function HeroSection() {
  const t = await getTranslations("home")

  return (
    <section id="top" className="relative overflow-hidden bg-[#f2f0eb] px-5 pb-16 pt-28 grain-overlay md:pb-24 md:pt-32">
      <div className="container relative z-10 mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
        <div className="rounded-[2rem] bg-[#1E3932] p-7 text-white shadow-[0_24px_70px_rgba(30,57,50,0.22)] md:p-10">
          <div className="flex items-center gap-3">
            <Image src="/logo.svg" alt="" width={46} height={46} loading="eager" className="size-11" />
            <span className="rounded-full bg-white/12 px-4 py-2 text-xs font-semibold tracking-[0.16em] text-white/78">
              {t("heroKicker")}
            </span>
          </div>

          <h1 className="mt-7 max-w-3xl font-display text-4xl font-bold leading-[1.05] tracking-wide sm:text-5xl lg:text-7xl">
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

          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {HERO_STATS.map((stat) => (
              <div key={stat.labelKey} className="rounded-2xl border border-white/12 bg-white/10 p-4">
                <p className="font-display text-2xl font-bold leading-none">{t(stat.valueKey)}</p>
                <p className="mt-2 text-xs leading-relaxed text-white/62">{t(stat.labelKey)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-bamboo-muted shadow-[0_22px_64px_rgba(35,27,16,0.14)]">
            <Image
              src="/images/landing/campus-panorama.webp"
              alt="Tokyo campus community"
              fill
              priority
              sizes="(min-width: 1024px) 42vw, 100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#1E3932]/74 via-[#1E3932]/12 to-transparent" />
            <div className="absolute bottom-5 left-5 right-5 rounded-[1.5rem] bg-[#fbf8f1]/92 p-5 text-[#1E3932] shadow-[0_12px_34px_rgba(0,0,0,0.14)] backdrop-blur">
              <p className="font-display text-xl font-semibold">{t("heroFeatureTitle")}</p>
              <div className="mt-4 grid gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-2"><MapPin className="size-4 text-bamboo" />{t("heroFeatureArea")}</span>
                <span className="inline-flex items-center gap-2"><CalendarDays className="size-4 text-bamboo" />{t("heroFeatureSchedule")}</span>
                <span className="inline-flex items-center gap-2"><UsersRound className="size-4 text-bamboo" />{t("heroFeaturePeople")}</span>
              </div>
            </div>
          </div>
          <p className="rounded-full border border-[#d9d1c1] bg-white/70 px-4 py-3 text-center text-xs font-medium text-muted-foreground">
            {t("heroTrustLine")}
          </p>
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
