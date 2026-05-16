import { getTranslations } from "next-intl/server"
import Link from "next/link"
import { ChevronDown } from "lucide-react"

const HERO_ENTRIES = [
  { href: "/scripts", titleKey: "heroEntryActivitiesTitle", descKey: "heroEntryActivitiesDesc" },
  { href: "/reviews", titleKey: "heroEntryReviewsTitle", descKey: "heroEntryReviewsDesc" },
  { href: "/organization", titleKey: "heroEntryCommunityTitle", descKey: "heroEntryCommunityDesc" },
  { href: "/login", titleKey: "heroEntryMatchingTitle", descKey: "heroEntryMatchingDesc" },
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
          {HERO_ENTRIES.map((entry) => (
            <Link
              key={entry.titleKey}
              href={entry.href}
              className="group rounded-2xl border border-[#d9d1c1] bg-white/76 p-4 text-left shadow-[0_10px_28px_rgba(35,27,16,0.05)] transition hover:-translate-y-1 hover:border-[#1E3932]/30 hover:bg-white sm:p-5"
            >
              <p className="font-display text-xl font-bold leading-tight text-[#1E3932] sm:text-2xl">
                {t(entry.titleKey)}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                {t(entry.descKey)}
              </p>
              <span className="mt-4 inline-flex text-xs font-semibold text-bamboo opacity-80 transition group-hover:translate-x-1">
                {t("heroEntryCta")}
              </span>
            </Link>
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
