"use client"

import Image from "next/image"
import { useRef, useState } from "react"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { useTranslations } from "next-intl"

const classes = [
  { key: "class1", image: "/images/landing/collective-social/miaoxingren-tokyo.png" },
  { key: "class2", image: "/images/landing/activity-wall-20260520/kpop-01.webp" },
  { key: "class3", image: "/images/landing/mobile-redesign/gallery-fireworks.webp" },
  { key: "class4", image: "/images/landing/activity-wall-20260520/boardgame-04.webp" },
  { key: "class5", image: "/images/landing/campus-panorama.webp" },
] as const

export function CollectiveSocialClassRail() {
  const t = useTranslations("collectiveSocial")
  const railRef = useRef<HTMLUListElement>(null)
  const [active, setActive] = useState(0)

  const scrollTo = (index: number) => {
    const rail = railRef.current
    const target = railRef.current?.children.item(index) as HTMLElement | null
    if (!rail || !target) return
    rail.scrollTo({
      left: target.offsetLeft - rail.offsetLeft - Number.parseFloat(getComputedStyle(rail).paddingLeft),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    })
  }

  const updateActive = () => {
    const rail = railRef.current
    if (!rail) return
    const center = rail.scrollLeft + rail.clientWidth / 2
    const distances = Array.from(rail.children).map((item) => {
      const card = item as HTMLElement
      return Math.abs(card.offsetLeft + card.offsetWidth / 2 - center)
    })
    setActive(distances.indexOf(Math.min(...distances)))
  }

  return (
    <section className="bg-[#fffdf7] py-20 md:py-28" aria-labelledby="future-classrooms-title">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#4f6843]">{t("classesEyebrow")}</p>
        <div className="mt-4 grid gap-5 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <h2 id="future-classrooms-title" className="font-display text-3xl font-bold tracking-[0.05em] text-[#1d291b] sm:text-4xl">{t("classesTitle")}</h2>
            <p className="mt-4 max-w-2xl text-sm leading-[1.85] text-[#62685d] sm:text-base">{t("classesBody")}</p>
          </div>
          <p className="text-sm font-semibold text-[#4f6843]">{t("classesHint")}</p>
        </div>
      </div>

      <ul
        ref={railRef}
        onScroll={updateActive}
        className="mt-10 flex snap-x snap-mandatory scroll-pl-5 gap-5 overflow-x-auto px-5 pb-5 scrollbar-none sm:scroll-pl-8 sm:px-8 lg:scroll-pl-[max(2rem,calc((100vw-72rem)/2))] lg:px-[max(2rem,calc((100vw-72rem)/2))]"
      >
        {classes.map(({ key, image }, index) => (
          <li key={key} className="min-w-[86vw] snap-start overflow-hidden rounded-[1.75rem] border border-[#d8d2c6] bg-[#f7f2e8] md:min-w-[46rem] lg:min-w-[58rem]">
            <article className="grid h-full md:grid-cols-[0.96fr_1.04fr]">
              <div className="flex min-h-72 flex-col justify-between p-7 sm:p-9 md:min-h-96">
                <div>
                  <p className="font-display text-sm font-semibold tracking-[0.18em] text-[#4f6843]">ISSUE {String(index + 1).padStart(2, "0")}</p>
                  <h3 className="mt-5 font-display text-3xl font-bold leading-tight text-[#1d291b] sm:text-4xl">{t(`${key}Title`)}</h3>
                  <p className="mt-5 text-sm leading-[1.95] text-[#555d50] sm:text-base">{t(`${key}Body`)}</p>
                </div>
                <ul className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-semibold text-[#4f6843]" aria-label={t(`${key}Title`)}>
                  {t(`${key}Tags`).split("|").map((tag) => (
                    <li key={tag} className="before:mr-3 before:text-[#9aac8d] before:content-['·'] first:before:hidden">{tag}</li>
                  ))}
                </ul>
              </div>
              <div className="relative min-h-64 overflow-hidden md:min-h-96">
                <Image src={image} alt="" fill sizes="(min-width: 768px) 30rem, 86vw" className="object-cover transition-transform duration-700 motion-reduce:transition-none md:hover:scale-[1.02]" />
              </div>
            </article>
          </li>
        ))}
      </ul>

      <div className="mx-auto mt-3 flex max-w-6xl items-center justify-between px-5 sm:px-8">
        <div className="flex gap-2" role="group" aria-label={t("classesHint")}>
          {classes.map(({ key }, index) => (
            <button key={key} type="button" onClick={() => scrollTo(index)} className="grid size-11 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5f8549] focus-visible:ring-offset-2" aria-label={`${index + 1} / ${classes.length}: ${t(`${key}Title`)}`} aria-current={active === index ? "true" : undefined}>
              <span className={`h-2 rounded-full transition-all motion-reduce:transition-none ${active === index ? "w-8 bg-[#5f8549]" : "w-2 bg-[#c5cfbd]"}`} />
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <RailButton label={t("classesPrevious")} onClick={() => scrollTo(Math.max(0, active - 1))} disabled={active === 0} Icon={ArrowLeft} />
          <RailButton label={t("classesNext")} onClick={() => scrollTo(Math.min(classes.length - 1, active + 1))} disabled={active === classes.length - 1} Icon={ArrowRight} />
        </div>
      </div>
    </section>
  )
}

function RailButton({ label, onClick, disabled, Icon }: { label: string; onClick: () => void; disabled: boolean; Icon: typeof ArrowLeft }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} disabled={disabled} className="grid size-11 place-items-center rounded-full border border-[#aabd9c] text-[#45613b] transition-colors hover:bg-[#edf3e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5f8549] focus-visible:ring-offset-4 disabled:cursor-not-allowed disabled:opacity-35 motion-reduce:transition-none">
      <Icon className="size-4" />
    </button>
  )
}
