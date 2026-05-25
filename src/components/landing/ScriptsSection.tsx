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
    <section className="relative min-h-[100svh] overflow-hidden bg-[#fffdf7] px-5 pb-5 pt-22 text-[#171717] grain-overlay md:pt-24">
      <Image src="/images/landing/activity-wall-20260520/shibuya-party-01.webp" alt="" fill priority sizes="100vw" className="object-cover opacity-70" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#fffdf7]/92 via-[#fffdf7]/72 to-[#fffdf7]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(255,255,255,0.92),rgba(255,253,247,0.45)_44%,rgba(255,253,247,0.9)_82%)]" />
      <div className="relative mx-auto flex min-h-[calc(100svh-6.5rem)] max-w-5xl flex-col justify-center">
        <div className="max-w-xl rounded-[1.2rem] border border-white/55 bg-white/72 p-4 shadow-[0_18px_48px_rgba(44,55,35,0.12)] backdrop-blur-md md:p-7">
            <h1 className="font-display text-4xl font-bold tracking-[0.08em] md:text-6xl">{copy.title}</h1>
            <div className="mt-3 flex items-center gap-4 text-[#7fa063] md:mt-5">
              <span className="h-px w-20 bg-[#9eb886]" />
              <span className="text-xl">✿</span>
              <span className="h-px w-20 bg-[#9eb886]" />
            </div>
            <p className="mt-3 max-w-md text-sm leading-[1.85] md:mt-5 md:text-lg">{copy.subtitle}</p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 md:mt-7 md:gap-5">
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
    <Link href={href} className="group relative h-[10rem] overflow-hidden rounded-[1.25rem] border border-[#e5dfd3] bg-white shadow-[0_16px_42px_rgba(44,55,35,0.12)] transition hover:-translate-y-0.5 sm:h-auto sm:aspect-square">
      <Image src={image} alt="" fill sizes="(min-width: 768px) 420px, 50vw" className="object-cover transition duration-700 group-hover:scale-[1.04]" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/68 via-black/18 to-white/10" />
      <div className="absolute inset-x-0 bottom-0 p-4 text-white md:p-6">
        <span className="mb-3 grid size-10 place-items-center rounded-full bg-white/90 text-[#5f8549] md:mb-4 md:size-12">{icon}</span>
        <h2 className="font-display text-2xl font-bold md:text-4xl">{title}</h2>
        <p className="mt-1 line-clamp-1 text-xs leading-relaxed text-white/86 md:mt-2 md:line-clamp-2 md:text-sm">{body}</p>
        <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold md:mt-4 md:text-sm">
          {cta}
          <ChevronRight className="size-4 transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  )
}
