import Image from "next/image"
import { getLocale } from "next-intl/server"
import { Camera, Drama, MessageCircle, PartyPopper, Sprout, Users } from "lucide-react"
import { LandingFooter } from "@/components/landing/LandingFooter"
import { LandingNav } from "@/components/landing/LandingNav"
import { landingCopy } from "@/lib/landing-copy"

const typeIcons = [Users, Drama, Camera, PartyPopper, MessageCircle] as const
const gallery = ["gallery-fireworks.webp", "gallery-table.webp", "gallery-park.webp", "gallery-room.webp", "gallery-bbq.webp", "gallery-mountain.webp"]
const avatars = ["bamboo.svg", "sakura.svg", "ink-mountain.svg", "tea-garden.svg", "campus-lantern.svg"]

export default async function OrganizationPage() {
  const copy = landingCopy(await getLocale()).about

  return (
    <>
      <LandingNav />
      <main className="bg-[#fffdf7] text-[#171717] grain-overlay">
        <section className="relative overflow-hidden pb-12 pt-28">
          <Image src="/images/landing/mobile-redesign/about-hero.webp" alt="" width={1400} height={700} priority className="absolute right-0 top-0 h-[420px] w-[68%] object-cover opacity-85" />
          <div className="absolute inset-x-0 top-0 h-[460px] bg-gradient-to-r from-[#fffdf7] via-[#fffdf7]/82 to-transparent" />
          <div className="relative mx-auto max-w-5xl px-7 pt-28">
            <h1 className="font-display text-6xl font-bold tracking-[0.1em]">{copy.title}</h1>
            <div className="mt-3 h-3 w-48 rounded-[50%] border-b-[9px] border-[#f3cf55]" />
            <p className="mt-8 whitespace-pre-line text-2xl leading-relaxed">{copy.subtitle}</p>
          </div>
        </section>

        <section className="mx-auto max-w-5xl space-y-8 px-5 pb-14">
          <article className="rounded-[2rem] border border-[#e5dfd3] bg-white p-7 shadow-[0_16px_42px_rgba(44,55,35,0.10)] md:p-10">
            <p className="mb-7 inline-flex items-center gap-2 font-semibold"><Sprout className="size-5 text-[#6b9a51]" />我们的理念</p>
            <div className="grid gap-8 md:grid-cols-[1.05fr_0.95fr] md:items-center">
              <div>
                <h2 className="whitespace-pre-line font-display text-3xl font-bold leading-relaxed md:text-4xl">
                  {copy.belief}
                </h2>
                <p className="mt-7 text-base leading-[2] text-[#343a30]">{copy.body}</p>
              </div>
              <Image src="/images/landing/mobile-redesign/about-night.webp" alt="" width={1400} height={933} className="w-full rounded-[1.5rem] object-cover" />
            </div>
            <div className="mt-9 grid grid-cols-5 gap-3 text-center text-sm">
              {copy.types.map((label, index) => {
                const Icon = typeIcons[index]
                return <div key={label} className="border-l border-[#e6e0d5] first:border-l-0"><Icon className="mx-auto mb-2 size-8 text-[#6b8f4e]" />{label}</div>
              })}
            </div>
          </article>

          <article className="rounded-[2rem] border border-[#e5dfd3] bg-white p-7 shadow-[0_16px_42px_rgba(44,55,35,0.08)] md:p-10">
            <p className="mb-7 inline-flex items-center gap-2 font-semibold"><Sprout className="size-5 text-[#6b9a51]" />为什么选择我们</p>
            <div className="grid gap-8 md:grid-cols-[1fr_auto_1fr] md:items-center">
              <CompareList title={copy.compareLeft} items={copy.left} />
              <div className="grid size-20 place-items-center rounded-full bg-[#e6efd9] font-display text-3xl text-[#5f8549]">VS</div>
              <CompareList title={copy.compareRight} items={copy.right} strong />
            </div>
          </article>

          <article className="rounded-[2rem] border border-[#e5dfd3] bg-white p-7 text-center shadow-[0_16px_42px_rgba(44,55,35,0.08)] md:p-10">
            <p className="mb-2 text-left font-semibold">团队介绍</p>
            <p className="mb-8 text-left text-sm text-[#4c5148]">{copy.teamIntro}</p>
            <div className="grid grid-cols-2 gap-5 md:grid-cols-5">
              {copy.roles.map(([role, tag, desc], index) => (
                <div key={role}>
                  <Image src={`/images/staff-avatars/${avatars[index]}`} alt="" width={96} height={96} className="mx-auto size-20 rounded-full" />
                  <p className="mt-3 font-display text-lg font-bold">{role}</p>
                  <p className="text-sm tracking-[0.18em]">{tag}</p>
                  <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-[#4c5148]">{desc}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[2rem] border border-[#e5dfd3] bg-white p-6 shadow-[0_16px_42px_rgba(44,55,35,0.08)]">
            <div className="grid gap-6 md:grid-cols-[1fr_180px] md:items-center">
              <div>
                <p className="font-display text-2xl font-bold">{copy.follow}</p>
                <div className="mt-5 grid grid-cols-3 gap-3 md:grid-cols-6">
                  {gallery.map((name) => <Image key={name} src={`/images/landing/mobile-redesign/${name}`} alt="" width={126} height={120} className="aspect-square rounded-xl object-cover" />)}
                </div>
              </div>
              <div className="rounded-[1.2rem] border border-[#dce5d0] bg-[#edf4e7] p-4 text-center">
                <Image src="/images/landing/mobile-redesign/contact-qr.png" alt="竹溪社管理员二维码" width={196} height={196} className="mx-auto size-28 rounded-lg bg-white p-1.5 shadow-sm" />
                <p className="mt-3 text-sm font-semibold">扫码联系管理员</p>
                <a href="mailto:zhuxishe@gmail.com" className="mt-2 block break-all text-xs text-[#5f8549]">
                  zhuxishe@gmail.com
                </a>
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

function CompareList({ title, items, strong = false }: { title: string; items: string[]; strong?: boolean }) {
  return (
    <div>
      <p className={`mb-5 rounded-full px-5 py-2 text-center text-sm font-semibold ${strong ? "bg-[#6b8f4e] text-white" : "bg-[#8da376] text-white"}`}>{title}</p>
      <ul className="space-y-3 text-sm leading-relaxed text-[#3d4438]">
        {items.map((item) => <li key={item} className="flex gap-2"><span className="mt-1 grid size-4 shrink-0 place-items-center rounded-full bg-[#9cb985] text-[10px] text-white">✓</span>{item}</li>)}
      </ul>
    </div>
  )
}
