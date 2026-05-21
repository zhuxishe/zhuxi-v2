import Image from "next/image"
import { getLocale } from "next-intl/server"
import { Camera, Drama, MessageCircle, PartyPopper, Sprout, Users } from "lucide-react"
import { LandingFooter } from "@/components/landing/LandingFooter"
import { LandingNav } from "@/components/landing/LandingNav"
import { OrganizationStoryCard } from "@/components/landing/OrganizationStoryCard"
import { TeamDepartmentGrid } from "@/components/landing/TeamDepartmentGrid"
import { landingCopy } from "@/lib/landing-copy"
import { publicContactHandle } from "@/lib/public-contact"

const typeIcons = [Users, Drama, Camera, PartyPopper, MessageCircle] as const
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
        <section className="relative overflow-hidden pb-8 pt-24">
          <Image src="/images/landing/activity-wall-20260520/bbq-03.webp" alt="" width={1400} height={900} priority className="absolute right-0 top-0 h-[360px] w-[70%] object-cover opacity-80" />
          <div className="absolute inset-x-0 top-0 h-[390px] bg-gradient-to-r from-[#fffdf7] via-[#fffdf7]/84 to-transparent" />
          <div className="relative mx-auto max-w-5xl px-6 pt-24">
            <h1 className="font-display text-5xl font-bold tracking-[0.08em] md:text-6xl">{copy.title}</h1>
            <div className="mt-3 h-3 w-44 rounded-[50%] border-b-[8px] border-[#f3cf55]" />
            <p className="mt-7 max-w-lg whitespace-pre-line text-xl leading-relaxed">{copy.subtitle}</p>
          </div>
        </section>

        <section className="mx-auto max-w-5xl space-y-6 px-5 pb-14">
          <OrganizationStoryCard />

          <article className="rounded-[1.8rem] border border-[#e5dfd3] bg-white/92 p-6 shadow-[0_16px_42px_rgba(44,55,35,0.08)] md:p-8">
            <p className="mb-6 inline-flex items-center gap-2 font-semibold"><Sprout className="size-5 text-[#6b9a51]" />我们的理念</p>
            <div className="grid gap-6 md:grid-cols-[1.05fr_0.95fr] md:items-center">
              <div>
                <h2 className="whitespace-pre-line font-display text-2xl font-bold leading-relaxed md:text-4xl">
                  {copy.belief}
                </h2>
                <p className="mt-5 text-sm leading-[1.9] text-[#343a30] md:text-base">{copy.body}</p>
              </div>
              <Image src="/images/landing/activity-wall-20260520/daiba-01.webp" alt="" width={1200} height={900} className="aspect-[4/3] w-full rounded-[1.4rem] object-cover" />
            </div>
            <div className="mt-7 grid grid-cols-5 gap-2 text-center text-xs md:text-sm">
              {copy.types.map((label, index) => {
                const Icon = typeIcons[index]
                return <div key={label} className="border-l border-[#e6e0d5] first:border-l-0"><Icon className="mx-auto mb-2 size-7 text-[#6b8f4e]" />{label}</div>
              })}
            </div>
          </article>

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
            <p className="mt-8 text-center font-display text-2xl text-[#5f8549]">“{copy.quote}”</p>
          </article>
        </section>
      </main>
      <LandingFooter />
    </>
  )
}
