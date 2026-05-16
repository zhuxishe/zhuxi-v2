import Image from "next/image"
import { getLocale } from "next-intl/server"
import { ClipboardPen, MessageCircle, PartyPopper, Users } from "lucide-react"
import { LandingFooter } from "@/components/landing/LandingFooter"
import { LandingNav } from "@/components/landing/LandingNav"
import { landingCopy } from "@/lib/landing-copy"

const icons = [MessageCircle, ClipboardPen, Users, PartyPopper] as const

export default async function JoinPage() {
  const copy = landingCopy(await getLocale()).join

  return (
    <>
      <LandingNav />
      <main className="relative overflow-hidden bg-[#fffdf7] px-5 pb-16 pt-28 text-[#171717] grain-overlay">
        <div className="absolute left-0 top-24 h-80 w-40 rounded-r-full bg-[#dcebcf]/60 blur-2xl" />
        <div className="absolute right-0 top-40 h-80 w-40 rounded-l-full bg-[#dcebcf]/60 blur-2xl" />

        <section className="relative mx-auto max-w-5xl pt-24 text-center">
          <p className="font-display text-6xl italic tracking-[0.12em] text-[#dce8d1]">Join us</p>
          <h1 className="-mt-8 font-display text-6xl font-bold tracking-[0.16em]">{copy.title}</h1>
          <div className="mx-auto mt-4 h-3 w-52 rounded-[50%] border-b-[9px] border-[#7fa063]" />
          <p className="mt-8 whitespace-pre-line text-2xl leading-relaxed">{copy.subtitle}</p>
        </section>

        <section className="relative mx-auto mt-12 max-w-4xl space-y-5">
          {copy.steps.map(([title, body], index) => {
            const Icon = icons[index]
            return (
              <article key={title} className="relative rounded-[1.5rem] border border-[#e5dfd3] bg-white/90 p-7 shadow-[0_14px_36px_rgba(43,53,35,0.09)]">
                <div className="grid grid-cols-[96px_1fr] items-center gap-5 md:grid-cols-[120px_1fr]">
                  <span className="grid size-20 place-items-center rounded-full bg-[#e4efd6] text-[#111] md:size-24">
                    <Icon className="size-10 md:size-12" />
                  </span>
                  <div>
                    <div className="flex items-baseline gap-4">
                      <p className="font-display text-3xl font-bold text-[#6b9a51] md:text-4xl">0{index + 1}</p>
                      <h2 className="font-display text-xl font-bold tracking-[0.02em] md:text-3xl">{title}</h2>
                    </div>
                    <p className="mt-4 whitespace-pre-line text-base leading-relaxed md:text-lg">{body}</p>
                  </div>
                </div>
                {index < copy.steps.length - 1 && <div className="absolute -bottom-5 left-1/2 z-10 grid size-10 -translate-x-1/2 place-items-center rounded-full bg-[#edf3e5] text-[#6b9a51]">⌄</div>}
              </article>
            )
          })}
        </section>

        <section className="relative mx-auto mt-12 max-w-4xl rounded-[1.4rem] bg-[#edf4e7] p-7">
          <div className="grid gap-6 md:grid-cols-[190px_1fr] md:items-center">
            <Image src="/images/landing/mobile-redesign/join-envelope.png" alt="" width={190} height={150} className="mx-auto" />
            <div>
              <h2 className="font-display text-3xl font-bold tracking-[0.12em]">{copy.comfortTitle}</h2>
              <p className="mt-4 text-lg leading-relaxed">{copy.comfortBody}</p>
            </div>
          </div>
        </section>

        <section className="relative mx-auto mt-9 max-w-4xl rounded-[1.4rem] border border-[#e5dfd3] bg-white/90 p-7 shadow-[0_14px_36px_rgba(43,53,35,0.08)]">
          <div className="grid gap-6 md:grid-cols-[1fr_190px] md:items-center">
            <div>
              <h2 className="font-display text-4xl font-bold tracking-[0.12em]">{copy.ctaTitle}</h2>
              <div className="mt-2 h-3 w-44 rounded-[50%] border-b-[9px] border-[#7fa063]" />
              <p className="mt-6 whitespace-pre-line text-lg leading-relaxed">{copy.ctaBody}</p>
            </div>
            <div className="text-center">
              <Image src="/images/landing/mobile-redesign/join-qr-v2.png" alt="" width={260} height={260} className="mx-auto rounded-xl border border-[#dce5d0]" />
              <p className="mt-3 text-sm">扫码添加管理员微信</p>
            </div>
          </div>
          <a href="mailto:contact@zhuxishe.com" className="mt-6 inline-flex rounded-full bg-[#6b9a51] px-8 py-3 text-lg font-semibold text-white">
            {copy.button}
            <span className="ml-3">›</span>
          </a>
        </section>
      </main>
      <LandingFooter />
    </>
  )
}
