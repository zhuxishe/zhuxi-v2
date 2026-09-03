import Image from "next/image"
import Link from "next/link"
import { Clock3, MapPin, Users } from "lucide-react"
import { localizeTag } from "@/lib/constants/tags-i18n"
import { rewriteStorageUrl } from "@/lib/storage-url"
import type { PlayerScriptSummary } from "@/lib/player-activity/types"

interface SocialScriptShelfProps {
  scripts: PlayerScriptSummary[]
  locale: string
  emptyLabel: string
}

export function SocialScriptShelf({ scripts, locale, emptyLabel }: SocialScriptShelfProps) {
  if (scripts.length === 0) {
    return (
      <div className="rounded-[20px] border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground shadow-soft">
        {emptyLabel}
      </div>
    )
  }

  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 scrollbar-none">
      {scripts.map((script, index) => (
        <Link
          key={script.id}
          href={`/app/scripts/${script.id}`}
          className="group w-24 shrink-0 snap-start rounded-[16px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={script.title}
        >
          <ScriptCover script={script} sizes="96px" className="aspect-[3/4] rounded-[16px]" priority={index === 0} />
          <span className="mt-2 block truncate text-sm font-semibold leading-5">{script.title}</span>
        </Link>
      ))}
    </div>
  )
}

interface ScriptGridProps {
  scripts: PlayerScriptSummary[]
  locale: string
  peopleLabel: string
  minutesLabel: string
  emptyLabel: string
}

export function ScriptGrid({ scripts, locale, peopleLabel, minutesLabel, emptyLabel }: ScriptGridProps) {
  if (scripts.length === 0) {
    return (
      <div className="rounded-[20px] border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground shadow-soft">
        {emptyLabel}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {scripts.map((script, index) => (
        <Link
          key={script.id}
          href={`/app/scripts/${script.id}`}
          className="group min-w-0 overflow-hidden rounded-[20px] border border-border bg-card shadow-soft transition hover:shadow-soft-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ScriptCover script={script} sizes="(min-width: 448px) 202px, calc((100vw - 44px) / 2)" className="aspect-[3/4] rounded-t-[19px]" priority={index === 0} />
          <span className="block p-3">
            <span className="block truncate text-sm font-semibold leading-5">{script.title}</span>
            {script.genreTags.length > 0 ? (
              <span className="mt-1.5 flex min-w-0 gap-1 overflow-hidden">
                {script.genreTags.slice(0, 2).map((tag) => (
                  <span key={tag} className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-primary">
                    {localizeTag(tag, locale)}
                  </span>
                ))}
              </span>
            ) : null}
            <span className="mt-2 grid gap-1 text-[11px] text-muted-foreground">
              <ScriptMeta icon={Users} text={formatPlayerCount(script, peopleLabel)} />
              {script.durationMinutes ? <ScriptMeta icon={Clock3} text={`${script.durationMinutes}${minutesLabel}`} /> : null}
              {script.location ? <ScriptMeta icon={MapPin} text={script.location} /> : null}
            </span>
          </span>
        </Link>
      ))}
    </div>
  )
}

function ScriptCover({
  script,
  sizes,
  className,
  priority = false,
}: {
  script: PlayerScriptSummary
  sizes: string
  className: string
  priority?: boolean
}) {
  const cover = rewriteStorageUrl(script.coverUrl)
    ?? "/images/landing/mobile-redesign/activity-script-bg.webp"
  return (
    <span className={`relative block overflow-hidden bg-secondary ${className}`}>
      <Image
        src={cover}
        alt=""
        fill
        unoptimized={cover.startsWith("https://")}
        priority={priority}
        sizes={sizes}
        className="object-cover transition duration-500 group-hover:scale-[1.025] motion-reduce:transition-none"
      />
    </span>
  )
}

function ScriptMeta({ icon: Icon, text }: { icon: typeof Users; text: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{text}</span>
    </span>
  )
}

function formatPlayerCount(script: PlayerScriptSummary, peopleLabel: string) {
  const min = script.playerCountMin
  const max = script.playerCountMax
  if (min && max) return `${min}-${max}${peopleLabel}`
  if (min) return `${min}+${peopleLabel}`
  if (max) return `≤${max}${peopleLabel}`
  return `—${peopleLabel}`
}
