import Image from "next/image"
import { getLocale } from "next-intl/server"
import { ClipboardPen, MessageCircle, PartyPopper, Users } from "lucide-react"
import { LandingFooter } from "@/components/landing/LandingFooter"
import { LandingNav } from "@/components/landing/LandingNav"
import { landingCopy } from "@/lib/landing-copy"
import { publicContactHandle } from "@/lib/public-contact"

const icons = [MessageCircle, ClipboardPen, Users, PartyPopper] as const

export default async function JoinPage() {
  const copy = landingCopy(await getLocale()).join

  return (
    <>
      <LandingNav />
      <main className="relative overflow-hidden bg-[#fffdf7] px-5 pb-16 pt-24 text-[#171717] grain-overlay">
        <div className="absolute left-0 top-24 h-64 w-32 rounded-r-full bg-[#dcebcf]/60 blur-2xl" />
        <div className="absolute right-0 top-40 h-64 w-32 rounded-l-full bg-[#dcebcf]/60 blur-2xl" />

        <section className="relative mx-auto max-w-5xl pt-14 text-center">
          <p className="font-display text-5xl italic tracking-[0.12em] text-[#dce8d1]">Join us</p>
          <h1 className="-mt-7 font-display text-5xl font-bold tracking-[0.14em] md:text-6xl">{copy.title}</h1>
          <div className="mx-auto mt-3 h-3 w-44 rounded-[50%] border-b-[8px] border-[#7fa063]" />
          <p className="mt-6 whitespace-pre-line text-xl leading-relaxed md:text-2xl">{copy.subtitle}</p>
        </section>

        <section className="relative mx-auto mt-9 grid max-w-5xl gap-5 md:grid-cols-[1.05fr_0.95fr] md:items-start">
          <div className="space-y-4">
            {copy.steps.map(([title, body], index) => {
              const Icon = icons[index]
              return (
                <article key={title} className="rounded-[1.3rem] border border-[#e5dfd3] bg-white/92 p-5 shadow-[0_12px_30px_rgba(43,53,35,0.08)]">
                  <div className="grid grid-cols-[72px_1fr] items-center gap-4">
                    <span className="grid size-16 place-items-center rounded-full bg-[#e4efd6] text-[#111]">
                      <Icon className="size-8" />
                    </span>
                    <div>
                      <div className="flex items-baseline gap-3">
                        <p className="font-display text-2xl font-bold text-[#6b9a51]">0{index + 1}</p>
                        <h2 className="font-display text-xl font-bold">{title}</h2>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-[#4c5148]">{body}</p>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>

          <section className="rounded-[1.5rem] border border-[#e5dfd3] bg-white/92 p-6 text-center shadow-[0_14px_36px_rgba(43,53,35,0.08)]">
            <h2 className="font-display text-3xl font-bold tracking-[0.08em]">{copy.ctaTitle}</h2>
            <div className="mx-auto mt-2 h-3 w-36 rounded-[50%] border-b-[8px] border-[#7fa063]" />
            <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-[#4c5148]">{copy.ctaBody}</p>
            <div className="mx-auto mt-6 w-full max-w-xs rounded-[1.3rem] bg-[#edf4e7] p-5">
              <Image src="/images/landing/contact/wechat-qr.png" alt="竹溪社管理员微信二维码" width={240} height={240} className="mx-auto size-48 rounded-xl bg-white p-2 shadow-sm" />
              <p className="mt-4 text-base font-semibold">{copy.button}</p>
              <p className="mt-1 text-sm font-semibold text-[#5f8549]">{copy.handleLabel}：{publicContactHandle}</p>
            </div>
          </section>
        </section>
      </main>
      <LandingFooter />
    </>
  )
}
