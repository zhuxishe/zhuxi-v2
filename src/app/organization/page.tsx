import Image from "next/image"
import { getLocale } from "next-intl/server"
import { LandingFooter } from "@/components/landing/LandingFooter"
import { LandingNav } from "@/components/landing/LandingNav"
import { OrganizationStoryCard } from "@/components/landing/OrganizationStoryCard"
import { TeamDepartmentGrid } from "@/components/landing/TeamDepartmentGrid"
import { landingCopy } from "@/lib/landing-copy"
import { publicContactHandle } from "@/lib/public-contact"

export default async function OrganizationPage() {
  const copy = landingCopy(await getLocale()).about

  return (
    <>
      <LandingNav />
      <main className="bg-[#fffdf7] text-[#171717] grain-overlay">
        <section className="relative min-h-[46svh] overflow-hidden px-5 pb-8 pt-24 md:pt-30">
          <Image src="/images/landing/activity-wall-20260520/bbq-03.webp" alt="" fill priority sizes="100vw" className="object-cover opacity-70" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#fffdf7]/96 via-[#fffdf7]/74 to-[#fffdf7]/24" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#fffdf7] via-transparent to-[#fffdf7]/82" />
          <div className="relative mx-auto flex min-h-[calc(46svh-7rem)] max-w-5xl items-start">
            <div className="max-w-xl rounded-[1.35rem] border border-white/55 bg-white/58 p-5 shadow-[0_18px_48px_rgba(44,55,35,0.10)] backdrop-blur-md md:p-7">
              <p className="text-xs font-semibold tracking-[0.2em] text-[#6b8f4e]">ABOUT ZHUXISHE</p>
              <h1 className="mt-2 font-display text-4xl font-bold tracking-[0.04em] md:text-5xl">{copy.title}</h1>
              <div className="mt-2 h-2 w-36 rounded-[50%] border-b-[6px] border-[#f3cf55]" />
              <p className="mt-4 max-w-lg text-sm leading-[1.85] text-[#343a30] md:text-base">{copy.subtitle}</p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl space-y-5 px-5 pb-14">
          <OrganizationStoryCard />
          <TeamDepartmentGrid />

          <article className="rounded-[1.8rem] border border-[#e5dfd3] bg-white/92 p-6 shadow-[0_16px_42px_rgba(44,55,35,0.08)] md:p-8">
            <div className="grid gap-6 md:grid-cols-[1fr_170px] md:items-center">
              <div className="min-w-0">
                <p className="font-display text-2xl font-bold">{copy.follow}</p>
                <p className="mt-2 text-sm font-semibold text-[#5f8549]">{publicContactHandle}</p>
              </div>
              <div className="rounded-[1.2rem] border border-[#dce5d0] bg-[#edf4e7] p-4 text-center">
                <Image src="/images/landing/contact/xiaohongshu-qr.png" alt="竹溪社小红书二维码" width={196} height={196} className="mx-auto size-28 rounded-lg bg-white p-1.5 shadow-sm" />
                <p className="mt-3 text-sm font-semibold">扫码关注小红书</p>
                <p className="mt-1 text-xs font-semibold text-[#5f8549]">{publicContactHandle}</p>
              </div>
            </div>
          </article>
        </section>
      </main>
      <LandingFooter />
    </>
  )
}
