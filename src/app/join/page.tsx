import Image from "next/image"
import { getLocale } from "next-intl/server"
import { ClipboardPen, MessageCircle, PartyPopper, UserRoundCheck, Users } from "lucide-react"
import { LandingFooter } from "@/components/landing/LandingFooter"
import { LandingNav } from "@/components/landing/LandingNav"
import { landingCopy } from "@/lib/landing-copy"
import { publicContactHandle } from "@/lib/public-contact"

const icons = [MessageCircle, ClipboardPen, UserRoundCheck, Users, PartyPopper] as const

export default async function JoinPage() {
  const copy = landingCopy(await getLocale()).join

  return (
    <>
      <LandingNav />
      <main className="relative min-h-[100svh] overflow-hidden bg-[#fffdf7] px-4 pb-3 pt-20 text-[#171717] grain-overlay md:px-5 md:pb-16 md:pt-24">
        <div className="absolute left-0 top-24 h-64 w-32 rounded-r-full bg-[#dcebcf]/60 blur-2xl" />
        <div className="absolute right-0 top-40 h-64 w-32 rounded-l-full bg-[#dcebcf]/60 blur-2xl" />

        <section className="relative mx-auto max-w-5xl pt-1 text-center md:pt-12">
          <p className="font-display text-3xl italic tracking-[0.12em] text-[#dce8d1] md:text-5xl">Join us</p>
          <h1 className="-mt-4 font-display text-3xl font-bold tracking-[0.12em] md:text-6xl">{copy.title}</h1>
          <div className="mx-auto mt-1 h-2 w-28 rounded-[50%] border-b-[5px] border-[#7fa063] md:w-36 md:border-b-[6px]" />
          <p className="mt-2 text-xs leading-relaxed md:text-2xl">{copy.subtitle}</p>
        </section>

        <section className="relative mx-auto mt-3 grid max-w-5xl gap-3 md:mt-9 md:grid-cols-[1.05fr_0.95fr] md:items-start md:gap-4">
          <div className="space-y-2 md:space-y-4">
            {copy.steps.map(([title, body], index) => {
              const Icon = icons[index]
              return (
                <article key={title} className="rounded-[0.9rem] border border-[#e5dfd3] bg-white/92 p-2.5 shadow-[0_10px_24px_rgba(43,53,35,0.07)] md:rounded-[1.3rem] md:p-5">
                  <div className="grid grid-cols-[42px_1fr] items-center gap-2.5 md:grid-cols-[72px_1fr] md:gap-4">
                    <span className="grid size-10 place-items-center rounded-full bg-[#e4efd6] text-[#111] md:size-16">
                      <Icon className="size-5 md:size-8" />
                    </span>
                    <div>
                      <div className="flex items-baseline gap-2.5 md:gap-3">
                        <p className="font-display text-lg font-bold text-[#6b9a51] md:text-2xl">0{index + 1}</p>
                        <h2 className="font-display text-base font-bold md:text-xl">{title}</h2>
                      </div>
                      <p className="mt-0.5 text-[10.5px] leading-[1.45] text-[#4c5148] md:mt-2 md:text-sm md:leading-relaxed">{body}</p>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>

          <section className="rounded-[1rem] border border-[#e5dfd3] bg-white/92 p-3 shadow-[0_12px_30px_rgba(43,53,35,0.08)] md:rounded-[1.5rem] md:p-6 md:text-center">
            <div className="grid grid-cols-[1fr_82px] items-center gap-3 md:block">
              <div>
                <h2 className="font-display text-xl font-bold tracking-[0.08em] md:text-3xl">{copy.ctaTitle}</h2>
                <div className="mt-1 h-2 w-24 rounded-[50%] border-b-[5px] border-[#7fa063] md:mx-auto md:mt-2 md:h-3 md:w-36 md:border-b-[8px]" />
                <p className="mt-2 whitespace-pre-line text-[11px] leading-relaxed text-[#4c5148] md:mt-4 md:text-sm">{copy.ctaBody}</p>
                <p className="mt-1 text-xs font-semibold text-[#5f8549] md:mt-3 md:text-sm">{copy.handleLabel}：{publicContactHandle}</p>
              </div>
              <div className="rounded-[0.9rem] bg-[#edf4e7] p-1.5 md:mx-auto md:mt-6 md:w-full md:max-w-xs md:p-5">
                <Image src="/images/landing/contact/wechat-qr.png" alt="竹溪社管理员微信二维码" width={240} height={240} className="mx-auto size-[70px] rounded-lg bg-white p-1 shadow-sm md:size-48 md:rounded-xl md:p-2" />
                <p className="mt-1 hidden text-center text-sm font-semibold md:block md:text-base">{copy.button}</p>
              </div>
            </div>
          </section>
        </section>
      </main>
      <LandingFooter />
    </>
  )
}
