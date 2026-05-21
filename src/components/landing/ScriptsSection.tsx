import Image from "next/image"
import Link from "next/link"
import { getLocale } from "next-intl/server"
import { BookOpen, CalendarDays, ChevronRight } from "lucide-react"
import type { ReactNode } from "react"
import { landingCopy } from "@/lib/landing-copy"

export async function ScriptsSection() {
  const locale = await getLocale()
  const copy = landingCopy(locale).activities
  const photoCta = locale === "ja" ? "写真を見る" : "查看照片"

  return (
    <section className="relative min-h-screen overflow-hidden bg-[#fffdf7] px-5 pb-14 pt-24 text-[#171717] grain-overlay">
      <Image src="/images/landing/activity-wall-20260520/shibuya-party-01.webp" alt="" width={1400} height={900} priority className="absolute right-0 top-0 h-[330px] w-[72%] object-cover opacity-55" />
      <div className="absolute inset-x-0 top-0 h-[390px] bg-gradient-to-r from-[#fffdf7] via-[#fffdf7]/84 to-transparent" />
      <div className="relative mx-auto max-w-5xl pt-20">
        <h1 className="font-display text-5xl font-bold tracking-[0.14em] md:text-7xl">{copy.title}</h1>
        <div className="mt-5 flex items-center gap-4 text-[#7fa063]">
          <span className="h-px w-20 bg-[#9eb886]" />
          <span className="text-xl">✿</span>
          <span className="h-px w-20 bg-[#9eb886]" />
        </div>
        <p className="mt-6 max-w-md whitespace-pre-line text-xl leading-relaxed md:text-2xl">{copy.subtitle}</p>

        <div className="mt-8 grid grid-cols-2 gap-3 md:gap-5">
          <EntryCard
            href="/reviews"
            image="/images/landing/activity-wall-20260520/bbq-01.webp"
            icon={<CalendarDays className="size-7" />}
            title={copy.photoTitle}
            body={copy.photoSubtitle}
            cta={photoCta}
          />
          <EntryCard
            href="/scripts/library"
            image="/images/landing/activity-wall-20260520/boardgame-01.webp"
            icon={<BookOpen className="size-7" />}
            title={copy.scriptTeaserTitle}
            body={copy.scriptTeaserBody}
            cta={copy.scriptTeaserCta}
          />
        </div>
      </div>
    </section>
  )
}

function EntryCard({ href, image, icon, title, body, cta }: { href: string; image: string; icon: ReactNode; title: string; body: string; cta: string }) {
  return (
    <Link href={href} className="group relative aspect-square overflow-hidden rounded-[1.5rem] border border-[#e5dfd3] bg-white shadow-[0_16px_42px_rgba(44,55,35,0.12)] transition hover:-translate-y-0.5">
      <Image src={image} alt="" fill sizes="(min-width: 768px) 420px, 50vw" className="object-cover transition duration-700 group-hover:scale-[1.04]" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/68 via-black/18 to-white/10" />
      <div className="absolute inset-x-0 bottom-0 p-4 text-white md:p-6">
        <span className="mb-4 grid size-12 place-items-center rounded-full bg-white/90 text-[#5f8549]">{icon}</span>
        <h2 className="font-display text-2xl font-bold md:text-4xl">{title}</h2>
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-white/86 md:text-sm">{body}</p>
        <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold md:text-sm">
          {cta}
          <ChevronRight className="size-4 transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  )
}
