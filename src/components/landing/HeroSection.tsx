import Image from "next/image"
import Link from "next/link"
import { getLocale } from "next-intl/server"
import { CalendarDays, CircleHelp, Users, Zap } from "lucide-react"
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
    <section className="relative overflow-hidden bg-[#fffdf7] px-5 pb-5 pt-20 text-[#171717] grain-overlay">
      <Image src="/images/landing/activity-wall-20260520/founded-01.webp" alt="" width={1200} height={900} priority className="absolute inset-x-0 top-12 h-56 w-full object-cover opacity-[0.15] blur-[2px]" />
      <div className="absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-[#fffdf7] via-[#fffdf7]/88 to-[#fffdf7]" />
      <div className="relative mx-auto max-w-5xl">
        <div className="pt-2 text-center md:pt-16">
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

        <div className="mt-5 grid grid-cols-2 gap-3 md:mt-9 md:gap-5">
          {copy.cards.map(([title, desc, href, color], index) => {
            const Icon = cardIcons[index]
            return (
              <Link key={title} href={href} className="group relative min-h-28 rounded-[1rem] border border-[#e7e2d7] bg-white/94 p-3 shadow-[0_10px_22px_rgba(43,53,35,0.08)] transition hover:-translate-y-0.5 md:min-h-40 md:p-5">
                <div className="flex items-start gap-2.5 md:gap-3">
                  <span className={`grid size-10 shrink-0 place-items-center rounded-[0.9rem] md:size-14 ${colorMap[color]}`}>
                    <Icon className="size-5 stroke-[2.4] md:size-7" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-base font-bold md:text-2xl">{title}</span>
                    <span className="mt-1.5 block whitespace-pre-line text-[11px] leading-relaxed text-[#2f322c] md:text-sm">
                      {desc}
                    </span>
                  </span>
                </div>
                <span className={`absolute bottom-3 right-3 grid size-11 place-items-center rounded-full text-lg text-white md:size-10 ${color === "gold" ? "bg-[#f4ca55]" : color === "sky" ? "bg-[#6bb7d7]" : color === "pink" ? "bg-[#ef8796]" : "bg-[#6fac55]"} transition group-hover:translate-x-0.5`}>
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
