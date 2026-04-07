"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"
import { Clock, Users } from "lucide-react"
import { TagBadge } from "@/components/shared/TagBadge"

interface Script {
  id: string
  title: string
  author: string | null
  player_count_min: number | null
  player_count_max: number | null
  duration_minutes: number | null
  genre_tags: string[] | null
  cover_url: string | null
}

export function ScriptCard({ script }: { script: Script }) {
  const t = useTranslations("scripts")

  return (
    <Link
      href={`/app/scripts/${script.id}`}
      className="group rounded-xl bg-card shadow-soft hover:shadow-soft-lg transition-all overflow-hidden"
    >
      {script.cover_url ? (
        <img src={script.cover_url} alt={script.title}
          className="aspect-[3/4] w-full object-cover group-hover:scale-[1.02] transition-transform" />
      ) : (
        <div className="aspect-[3/4] w-full bg-gradient-to-br from-sakura-light via-gold-muted to-card flex items-center justify-center p-4">
          <span className="heading-display text-lg text-foreground/50 text-center leading-tight line-clamp-3">
            {script.title}
          </span>
        </div>
      )}
      <div className="p-3 space-y-1.5">
        <p className="text-sm font-semibold line-clamp-1">{script.title}</p>
        {script.author && <p className="text-xs text-muted-foreground">{script.author}</p>}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Users className="size-3" />{script.player_count_min ?? 0}-{script.player_count_max ?? 0}</span>
          <span className="flex items-center gap-1"><Clock className="size-3" />{script.duration_minutes ?? 0}min</span>
        </div>
        {(script.genre_tags?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1">
            {script.genre_tags?.slice(0, 3).map((tag) => <TagBadge key={tag} label={tag} className="text-[10px] px-1.5 py-0.5" />)}
          </div>
        )}
      </div>
    </Link>
  )
}
