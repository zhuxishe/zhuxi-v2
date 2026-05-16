import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { ArrowLeft, Clock, MapPin, Sparkles, Users, Wallet } from "lucide-react"
import { BambooLeaves } from "@/components/landing/BambooLeaves"
import { LandingFooter } from "@/components/landing/LandingFooter"
import { LandingNav } from "@/components/landing/LandingNav"
import { TagBadge } from "@/components/shared/TagBadge"
import { fetchScript } from "@/lib/queries/scripts"
import { rewriteStorageUrl } from "@/lib/storage-url"
import type { Tables } from "@/types/database.types"
import type { ReactNode } from "react"

type Script = Tables<"scripts">
type Props = { params: Promise<{ id: string }> }

export default async function PublicScriptDetailPage({ params }: Props) {
  const { id } = await params
  const script = await loadPublicScript(id)
  const t = await getTranslations("publicScript")
  const coverUrl = rewriteStorageUrl(script.cover_url)
  const intro = stripHtml(script.content_html) || script.description

  return (
    <>
      <BambooLeaves />
      <LandingNav />
      <main className="min-h-screen bg-[#f2f0eb] px-5 pb-20 pt-28 md:pt-32">
        <article className="container mx-auto max-w-6xl">
          <Link href="/scripts" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-bamboo">
            <ArrowLeft className="size-4" />
            {t("back")}
          </Link>

          <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
            <CoverImage url={coverUrl} title={script.title} />
            <section className="landing-card bg-white p-7 md:p-9">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-bamboo">{t("kicker")}</p>
              <h1 className="mt-3 font-display text-4xl font-bold leading-tight text-[#13241d] md:text-6xl">
                {script.title}
              </h1>
              <InfoChips script={script} durationLabel={t("duration")} peopleLabel={t("people")} />
              {intro && <p className="mt-6 whitespace-pre-wrap text-sm leading-[1.9] text-muted-foreground md:text-base">{intro}</p>}
              <TagCloud script={script} />
            </section>
          </div>

          <Gallery heading={t("galleryTitle")} empty={t("galleryEmpty")} cta={t("galleryCta")} />
        </article>
      </main>
      <LandingFooter />
    </>
  )
}

async function loadPublicScript(id: string) {
  try {
    const script = await fetchScript(id)
    if (!script.is_published) notFound()
    return script
  } catch {
    notFound()
  }
}

function CoverImage({ url, title }: { url: string | null; title: string }) {
  if (!url) return <div className="landing-card grid aspect-[4/3] place-items-center bg-white text-bamboo"><Sparkles className="size-12" /></div>
  return <Image src={url} alt={title} width={1200} height={900} sizes="(min-width: 1024px) 46vw, 100vw" className="landing-card aspect-[4/3] w-full object-cover" />
}

function InfoChips({ script, durationLabel, peopleLabel }: { script: Script; durationLabel: string; peopleLabel: string }) {
  const min = script.player_count_min ?? 0
  const max = script.player_count_max ?? min
  return (
    <div className="mt-6 flex flex-wrap gap-2 text-sm text-muted-foreground">
      <Chip icon={<Users className="size-4" />}>{min}-{max}{peopleLabel}</Chip>
      {script.duration_minutes && <Chip icon={<Clock className="size-4" />}>{script.duration_minutes}{durationLabel}</Chip>}
      {script.location && <Chip icon={<MapPin className="size-4" />}>{script.location}</Chip>}
      {script.budget && <Chip icon={<Wallet className="size-4" />}>{script.budget}</Chip>}
    </div>
  )
}

function Chip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f2f0eb] px-3 py-1.5">{icon}{children}</span>
}

function TagCloud({ script }: { script: Script }) {
  const tags = [...(script.genre_tags ?? []), ...(script.theme_tags ?? [])]
  if (tags.length === 0) return null
  return <div className="mt-6 flex flex-wrap gap-2">{tags.map((tag) => <TagBadge key={tag} label={tag} />)}</div>
}

function Gallery({ heading, empty, cta }: { heading: string; empty: string; cta: string }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-3xl font-bold text-[#13241d]">{heading}</h2>
      <div className="landing-card mt-5 bg-white p-7 text-sm leading-relaxed text-muted-foreground">
        <p>{empty}</p>
        <Link href="/reviews" className="mt-4 inline-flex font-semibold text-bamboo">
          {cta}
        </Link>
      </div>
    </section>
  )
}

function stripHtml(value: string | null) {
  return value?.replace(/<[^>]*>/g, "").trim() ?? ""
}
