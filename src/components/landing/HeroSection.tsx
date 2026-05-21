import Image from "next/image"
import Link from "next/link"
import { getLocale } from "next-intl/server"
import { CalendarDays, CircleHelp, Users, Zap } from "lucide-react"
import { HomeActivityStrip } from "@/components/landing/HomeActivityStrip"
import { landingCopy } from "@/lib/landing-copy"

const cardIcons = [Users, CalendarDays, Zap, CircleHelp] as const
const colorMap: Record<string, string> = {
  green: "bg-[#dcefc7] text-[#547d3b]",
  gold: "bg-[#ffe59b] text-[#9d7424]",
  sky: "bg-[#cdeaf8] text-[#4e91ae]",
  pink: "bg-[#ffd4da] text-[#c66976]",
}

export async function HeroSection() {
  const copy = landingCopy(await getLocale()).home

  return (
    <section className="relative overflow-hidden bg-[#fffdf7] px-5 pb-8 pt-24 text-[#171717] grain-overlay">
      <div className="absolute left-0 top-28 h-64 w-24 rounded-r-full bg-[#dfeccd]/80 blur-2xl" />
      <div className="absolute right-0 top-24 h-72 w-28 rounded-l-full bg-[#f6e7a7]/45 blur-2xl" />
      <div className="relative mx-auto max-w-5xl">
        <div className="pt-4 text-center md:pt-16">
          <p className="font-display text-2xl font-bold tracking-[0.1em] sm:text-5xl">
            {copy.lead}
          </p>
          <h1 className="mt-1 font-display text-4xl font-bold leading-none tracking-[0.04em] text-[#5d8b43] sm:text-7xl">
            {copy.title}
          </h1>
          <div className="mx-auto mt-1 h-2.5 w-40 rounded-[50%] border-b-[6px] border-[#f5d35a]" />
          <p className="mt-3 text-sm font-medium tracking-[0.03em] sm:text-xl">
            {copy.subtitle}
          </p>
        </div>

        <HomeActivityStrip />

        <div className="mt-6 grid grid-cols-2 gap-3 md:mt-9 md:gap-5">
          {copy.cards.map(([title, desc, href, color], index) => {
            const Icon = cardIcons[index]
            return (
              <Link key={title} href={href} className="group relative min-h-32 overflow-hidden rounded-[1.2rem] border border-[#e2dccf] bg-[#fffef9] p-4 shadow-[0_14px_34px_rgba(43,53,35,0.09)] transition hover:-translate-y-0.5 md:min-h-44 md:p-6">
                <span className={`absolute inset-x-0 top-0 h-1 ${colorMap[color]}`} />
                <div className="flex items-start justify-between gap-3">
                  <span className="font-display text-[11px] font-bold tracking-[0.24em] text-[#8a907f]">
                    0{index + 1}
                  </span>
                  <span className="grid size-9 place-items-center rounded-full bg-[#f1f4ea] text-[#5f8549] md:size-11">
                    <Icon className="size-5 stroke-[2.2] md:size-6" />
                  </span>
                </div>
                <span className="mt-5 block font-display text-lg font-bold leading-tight md:text-2xl">{title}</span>
                <span className="mt-2 block whitespace-pre-line text-[12px] leading-relaxed text-[#3c4237] md:text-sm">
                  {desc}
                </span>
                <span className="absolute bottom-3 right-3 grid size-10 place-items-center rounded-full border border-[#dfe7d4] bg-white text-lg text-[#5f8549] transition group-hover:translate-x-0.5 md:bottom-5 md:right-5">
                  ›
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}
