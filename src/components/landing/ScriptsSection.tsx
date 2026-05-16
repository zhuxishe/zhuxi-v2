import Image from "next/image"
import Link from "next/link"
import { getLocale } from "next-intl/server"
import { ChevronRight, Drama, Mountain } from "lucide-react"
import { landingCopy } from "@/lib/landing-copy"

const icons = [Mountain, Drama] as const

export async function ScriptsSection() {
  const copy = landingCopy(await getLocale()).activities

  return (
    <section className="relative overflow-hidden bg-[#fffdf7] pb-14 pt-28 text-[#171717] grain-overlay">
      <Image src="/images/landing/mobile-redesign/activities-hero.png" alt="" width={627} height={520} priority className="absolute right-0 top-0 h-[520px] w-[68%] object-cover opacity-80" />
      <div className="absolute inset-x-0 top-0 h-[580px] bg-gradient-to-r from-[#fffdf7] via-[#fffdf7]/82 to-transparent" />
      <div className="relative mx-auto max-w-5xl px-7 pt-40">
        <h1 className="font-display text-6xl font-bold tracking-[0.18em] md:text-7xl">{copy.title}</h1>
        <div className="mt-8 flex items-center gap-5 text-[#7fa063]">
          <span className="h-px w-28 bg-[#9eb886]" />
          <span className="text-2xl">✿</span>
          <span className="h-px w-28 bg-[#9eb886]" />
        </div>
        <p className="mt-10 whitespace-pre-line text-2xl leading-relaxed">{copy.subtitle}</p>
      </div>

      <div className="relative mx-auto mt-14 max-w-5xl space-y-8 px-5">
        {copy.cards.map(([title, tags, body, href, image], index) => {
          const Icon = icons[index]
          return (
            <Link key={title} href={href} className="group relative block overflow-hidden rounded-[1.3rem] border-4 border-white bg-[#111] shadow-[0_16px_40px_rgba(31,39,28,0.24)]">
              <Image src={`/images/landing/mobile-redesign/${image}`} alt="" width={535} height={420} className="h-[420px] w-full object-cover opacity-75 transition duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/72 via-black/38 to-black/12" />
              <div className="absolute inset-0 flex flex-col justify-center p-9 text-white">
                <span className="mb-7 grid size-24 place-items-center rounded-full bg-[#eff8e8] text-[#111]">
                  <Icon className="size-12" />
                </span>
                <h2 className="font-display text-5xl font-bold tracking-[0.1em]">{title}</h2>
                <div className="my-6 h-1 w-16 rounded-full bg-[#b6c995]" />
                <p className="text-2xl tracking-[0.08em]">{tags}</p>
                <p className="mt-5 text-lg text-white/90">{body}</p>
                <span className="mt-9 inline-flex w-fit items-center gap-5 rounded-full bg-white px-9 py-4 text-xl font-semibold text-[#5f8549]">
                  点击进入
                  <ChevronRight className="size-6 transition group-hover:translate-x-1" />
                </span>
              </div>
            </Link>
          )
        })}

        <div className="rounded-[1.2rem] border border-[#e3dfd2] bg-white/82 px-7 py-10 text-center shadow-[0_14px_34px_rgba(43,53,35,0.08)]">
          <p className="whitespace-pre-line font-display text-2xl leading-relaxed">
            {copy.note}
          </p>
        </div>
      </div>
    </section>
  )
}
