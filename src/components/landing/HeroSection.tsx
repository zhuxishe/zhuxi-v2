import Image from "next/image"
import Link from "next/link"
import { getLocale } from "next-intl/server"
import { CalendarDays, CircleHelp, HeartHandshake, Leaf, ShieldCheck, Sprout, Users, Zap } from "lucide-react"
import { landingCopy } from "@/lib/landing-copy"

const cardIcons = [Users, CalendarDays, Zap, CircleHelp] as const
const trustIcons = [ShieldCheck, HeartHandshake, ShieldCheck, Sprout] as const
const colorMap: Record<string, string> = {
  green: "bg-[#dcefc7] text-[#547d3b]",
  gold: "bg-[#ffe59b] text-[#9d7424]",
  sky: "bg-[#cdeaf8] text-[#4e91ae]",
  pink: "bg-[#ffd4da] text-[#c66976]",
}

export async function HeroSection() {
  const copy = landingCopy(await getLocale()).home

  return (
    <section className="relative overflow-hidden bg-[#fffdf7] pt-28 text-[#171717] grain-overlay">
      <div className="absolute left-0 top-28 h-72 w-36 rounded-r-full bg-[#d7e8c6]/45 blur-2xl" />
      <div className="absolute right-0 top-24 h-72 w-28 rounded-l-full bg-[#d7e8c6]/55 blur-2xl" />
      <div className="relative mx-auto max-w-5xl px-5 pb-10">
        <div className="pt-20 text-center">
          <p className="font-display text-5xl font-bold tracking-[0.16em] sm:text-6xl">
            {copy.lead}
          </p>
          <h1 className="mt-4 font-display text-6xl font-bold leading-none tracking-[0.08em] text-[#5d8b43] sm:text-8xl">
            {copy.title}
          </h1>
          <div className="mx-auto mt-2 h-4 w-72 rounded-[50%] border-b-[10px] border-[#f5d35a]" />
          <p className="mt-8 text-xl font-medium tracking-[0.08em] sm:text-2xl">
            {copy.subtitle}
          </p>
        </div>

        <div className="mx-auto mt-8 flex max-w-4xl flex-wrap justify-center gap-2 rounded-full bg-white/88 p-3 shadow-[0_14px_42px_rgba(49,62,38,0.12)]">
          {copy.pills.map((pill) => (
            <span key={pill} className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold">
              <Leaf className="size-5 text-[#6b9a51]" />
              {pill}
            </span>
          ))}
        </div>
      </div>

      <div className="relative mx-auto max-w-5xl">
        <Image
          src="/images/landing/mobile-redesign/home-hero.webp"
          alt=""
          width={1400}
          height={700}
          priority
          className="h-auto w-full object-cover"
        />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#fffdf7] to-transparent" />
      </div>

      <div className="relative mx-auto grid max-w-5xl grid-cols-2 gap-3 px-5 pb-14 pt-4 md:gap-5">
        {copy.cards.map(([title, desc, href, color], index) => {
          const Icon = cardIcons[index]
          return (
            <Link key={title} href={href} className="group relative min-h-44 rounded-[1.3rem] border border-[#e7e2d7] bg-white p-4 shadow-[0_14px_36px_rgba(43,53,35,0.10)] transition hover:-translate-y-1 md:min-h-48 md:p-6">
              <div className="flex gap-2 md:gap-5">
                <span className={`grid size-12 shrink-0 place-items-center rounded-[1rem] md:size-20 md:rounded-[1.4rem] ${colorMap[color]}`}>
                  <Icon className="size-7 stroke-[2.4] md:size-10" />
                </span>
                <span className="flex-1">
                  <span className="block font-display text-lg font-bold md:text-2xl">{title}</span>
                  <span className="mt-2 block whitespace-pre-line text-[13px] leading-relaxed text-[#2f322c] md:mt-3 md:text-base">
                    {desc}
                  </span>
                </span>
              </div>
              <span className={`absolute bottom-4 right-4 grid size-9 place-items-center rounded-full text-white md:size-12 ${color === "gold" ? "bg-[#f4ca55]" : color === "sky" ? "bg-[#6bb7d7]" : color === "pink" ? "bg-[#ef8796]" : "bg-[#6fac55]"} transition group-hover:translate-x-1`}>
                ›
              </span>
            </Link>
          )
        })}
      </div>

      <div className="relative mx-auto max-w-5xl px-5 pb-14 text-center">
        <p className="font-display text-2xl font-semibold tracking-[0.12em]">
          {copy.slogan}
        </p>
        <div className="mt-10 grid grid-cols-2 gap-5 md:grid-cols-4">
          {copy.trusts.map(([title, desc], index) => {
            const Icon = trustIcons[index]
            return (
              <div key={title} className="text-[#5d7d49]">
                <Icon className="mx-auto mb-2 size-8" />
                <p className="font-semibold">{title}</p>
                <p className="text-xs">{desc}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
