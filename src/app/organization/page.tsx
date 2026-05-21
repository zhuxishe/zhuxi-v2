import Image from "next/image"
import { getLocale } from "next-intl/server"
import { LandingFooter } from "@/components/landing/LandingFooter"
import { LandingNav } from "@/components/landing/LandingNav"
import { OrganizationStoryCard } from "@/components/landing/OrganizationStoryCard"
import { TeamDepartmentGrid } from "@/components/landing/TeamDepartmentGrid"
import { landingCopy } from "@/lib/landing-copy"
import { publicContactHandle } from "@/lib/public-contact"

const gallery = [
  "founded-01.webp",
  "bbq-03.webp",
  "shibuya-party-01.webp",
  "team-game-01.webp",
  "disney-01.webp",
  "asakusa-01.webp",
]

export default async function OrganizationPage() {
  const copy = landingCopy(await getLocale()).about

  return (
    <>
      <LandingNav />
      <main className="bg-[#fffdf7] text-[#171717] grain-overlay">
        <section className="relative min-h-[72svh] overflow-hidden px-5 pb-10 pt-28 md:pt-36">
          <Image src="/images/landing/activity-wall-20260520/bbq-03.webp" alt="" fill priority sizes="100vw" className="object-cover opacity-70" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#fffdf7]/96 via-[#fffdf7]/74 to-[#fffdf7]/24" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#fffdf7] via-transparent to-[#fffdf7]/82" />
          <div className="relative mx-auto flex min-h-[calc(72svh-9rem)] max-w-5xl items-end">
            <div className="max-w-xl rounded-[1.6rem] border border-white/55 bg-white/70 p-6 shadow-[0_18px_48px_rgba(44,55,35,0.12)] backdrop-blur-md md:p-8">
              <p className="text-xs font-semibold tracking-[0.2em] text-[#6b8f4e]">ABOUT ZHUXISHE</p>
              <h1 className="mt-4 font-display text-5xl font-bold tracking-[0.05em] md:text-6xl">{copy.title}</h1>
              <div className="mt-3 h-3 w-44 rounded-[50%] border-b-[8px] border-[#f3cf55]" />
              <p className="mt-7 max-w-lg whitespace-pre-line break-all text-lg leading-[1.9] md:text-xl">{copy.subtitle}</p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl space-y-6 px-5 pb-14">
          <OrganizationStoryCard />
          <TeamDepartmentGrid />

          <article className="rounded-[1.8rem] border border-[#e5dfd3] bg-white/92 p-6 shadow-[0_16px_42px_rgba(44,55,35,0.08)] md:p-8">
            <div className="grid gap-6 md:grid-cols-[1fr_170px] md:items-center">
              <div>
                <p className="font-display text-2xl font-bold">{copy.follow}</p>
                <div className="mt-5 grid grid-cols-3 gap-3 md:grid-cols-6">
                  {gallery.map((name) => <Image key={name} src={`/images/landing/activity-wall-20260520/${name}`} alt="" width={240} height={180} className="aspect-square rounded-xl object-cover" />)}
                </div>
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
