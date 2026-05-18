import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"
import { getLocale } from "next-intl/server"
import { BookOpen, ChevronRight, MapPin, Users } from "lucide-react"
import { localizeTag } from "@/lib/constants/tags-i18n"
import { landingCopy } from "@/lib/landing-copy"
import { fetchPublishedScripts } from "@/lib/queries/scripts"
import { rewriteStorageUrl } from "@/lib/storage-url"

export async function PublicScriptLibrary({ showHeader = true }: { showHeader?: boolean }) {
  const locale = await getLocale()
  const copy = landingCopy(locale).activities
  const scripts = (await fetchPublishedScripts().catch(() => [])).slice(0, 8)

  return (
    <section id="script-library" className="scroll-mt-24 rounded-[1.8rem] border border-[#e5dfd3] bg-white/88 p-5 shadow-[0_16px_42px_rgba(44,55,35,0.10)] md:p-8">
      {showHeader && (
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-[#6b8f4e]">
              <BookOpen className="size-4" />
              {copy.libraryTitle}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[#4c5148]">{copy.librarySubtitle}</p>
          </div>
          <span className="hidden text-sm font-semibold text-[#5f8549] md:inline-flex">
            {locale === "ja" ? `${scripts.length}件公開中` : `${scripts.length}个公开中`}
          </span>
        </div>
      )}

      {scripts.length === 0 ? (
        <div className="rounded-2xl bg-[#f5f7ef] px-5 py-10 text-center text-sm text-[#5f665a]">
          {copy.libraryEmpty}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {scripts.map((script) => <ScriptPreviewCard key={script.id} script={script} locale={locale} cta={copy.libraryCta} />)}
        </div>
      )}
    </section>
  )
}

function ScriptPreviewCard({
  script,
  locale,
  cta,
}: {
  script: Awaited<ReturnType<typeof fetchPublishedScripts>>[number]
  locale: string
  cta: string
}) {
  const ja = locale === "ja"
  const cover = rewriteStorageUrl(script.cover_url)
  const tags = script.genre_tags.slice(0, 3)

  return (
    <Link href={`/scripts/${script.id}`} className="group grid overflow-hidden rounded-[1.25rem] border border-[#e9e2d6] bg-[#fffdf7] transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(43,53,35,0.12)] sm:grid-cols-[136px_1fr]">
      <div className="relative aspect-[4/3] bg-[#edf4e7] sm:aspect-auto">
        {cover ? (
          <Image src={cover} alt="" fill sizes="(min-width: 768px) 136px, 100vw" className="object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-[#6b8f4e]">
            <BookOpen className="size-10" />
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-display text-xl font-semibold leading-snug">{script.title}</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span key={tag} className="rounded-full bg-[#edf4e7] px-3 py-1 text-xs font-semibold text-[#5f8549]">
              {localizeTag(tag, locale)}
            </span>
          ))}
        </div>
        <div className="mt-4 grid gap-2 text-xs text-[#5f665a]">
          <Meta icon={<Users className="size-3.5" />} text={formatPlayers(script.player_count_min, script.player_count_max, ja)} />
          <Meta icon={<MapPin className="size-3.5" />} text={script.location ?? (ja ? "対面活動" : "线下活动")} />
        </div>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#5f8549]">
          {cta}
          <ChevronRight className="size-4 transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  )
}

function Meta({ icon, text }: { icon: ReactNode; text: string }) {
  return <span className="inline-flex items-center gap-1.5">{icon}{text}</span>
}

function formatPlayers(min: number | null, max: number | null, ja: boolean) {
  if (min && max) return `${min}-${max}人`
  if (min) return ja ? `${min}人から` : `${min}人起`
  if (max) return ja ? `最大${max}人` : `最多${max}人`
  return ja ? "人数未定" : "人数待定"
}
