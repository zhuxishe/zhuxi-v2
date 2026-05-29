import Link from "next/link"
import { getLocale } from "next-intl/server"
import { CalendarDays, CircleHelp, Users, Zap } from "lucide-react"
import { HeroPhotoSlider } from "@/components/landing/HeroPhotoSlider"
import { HeroSchoolPie } from "@/components/landing/HeroSchoolPie"
import { landingCopy } from "@/lib/landing-copy"

const cardIcons = [Users, CalendarDays, Zap, CircleHelp] as const
const colorMap: Record<string, string> = {
  green: "border-[#b7d5a6] text-[#547d3b]",
  gold: "border-[#f2d26a] text-[#9d7424]",
  sky: "border-[#a9d8e7] text-[#4e91ae]",
  pink: "border-[#f2b6c0] text-[#c66976]",
}

export async function HeroSection() {
  const locale = await getLocale()
  const copy = landingCopy(locale).home

  return (
    <section className="relative min-h-[100svh] overflow-hidden bg-[#fffdf7] px-4 pb-4 pt-22 text-[#171717] grain-overlay md:px-5 md:pt-24">
      <HeroPhotoSlider />
      <div className="absolute inset-0 bg-gradient-to-b from-[#fffdf7]/86 via-[#fffdf7]/48 to-[#fffdf7]/90" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_24%,rgba(255,255,255,0.86),rgba(255,253,247,0.26)_34%,rgba(255,253,247,0.88)_82%)]" />
      <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#fffdf7] to-transparent" />

      <div className="relative mx-auto flex min-h-[calc(100svh-6.75rem)] max-w-5xl flex-col justify-start gap-4 py-2 md:justify-center md:gap-7 md:py-0">
        <div className="text-center">
          <p className="font-display text-[2rem] font-bold tracking-[0.08em] md:text-5xl">
            {copy.lead}
          </p>
          <h1 className="mt-1 whitespace-nowrap font-display text-[2.45rem] font-bold leading-none tracking-[0.01em] text-[#5d8b43] md:text-7xl">
            {copy.title}
          </h1>
          <div className="mx-auto mt-1 h-2.5 w-40 rounded-[50%] border-b-[6px] border-[#f5d35a]" />
          <p className="mt-3 text-sm font-semibold tracking-[0.03em] md:text-xl">
            {copy.subtitle}
          </p>
        </div>

        <HeroSchoolPie ja={locale === "ja"} />

        <div className="grid grid-cols-2 gap-2 md:gap-4">
          {copy.cards.map(([title, desc, href, color], index) => {
            const Icon = cardIcons[index]
            return (
              <Link key={title} href={href} className={`group relative min-h-[3.65rem] min-w-0 overflow-hidden rounded-[0.9rem] border-t-4 bg-white/78 p-2.5 shadow-[0_10px_24px_rgba(43,53,35,0.09)] backdrop-blur-md transition hover:-translate-y-0.5 md:min-h-30 md:p-5 ${colorMap[color]}`}>
                <div className="flex h-full items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block font-display text-base font-bold leading-tight md:text-2xl">{title}</span>
                    {desc && <span className="mt-1.5 block whitespace-pre-line text-[11px] leading-relaxed text-[#343a30] md:text-sm">{desc}</span>}
                  </span>
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#f1f4ea] text-[#5f8549] md:size-10">
                    <Icon className="size-4.5 stroke-[2.2] md:size-6" />
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}
