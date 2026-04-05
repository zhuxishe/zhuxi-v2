"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"
import { Clock, Users } from "lucide-react"
import { TagBadge } from "@/components/shared/TagBadge"

interface Script {
  id: string
  title: string
  author: string | null
  player_count_min: number
  player_count_max: number
  duration_minutes: number
  genre_tags: string[]
  cover_url: string | null
}

export function ScriptCard({ script }: { script: Script }) {
  const t = useTranslations("scripts")

  return (
    <Link
      href={`/app/scripts/${script.id}`}
      className="group rounded-xl bg-card ring-1 ring-foreground/10 hover:ring-primary/30 transition-all overflow-hidden"
    >
      {script.cover_url ? (
        <img src={script.cover_url} alt={script.title}
          className="w-full h-28 object-cover group-hover:scale-[1.02] transition-transform" />
      ) : (
        <div className="w-full h-28 bg-muted/50 flex items-center justify-center text-muted-foreground text-xs">
          {t("noCover")}
        </div>
      )}
      <div className="p-3 space-y-1.5">
        <p className="text-sm font-semibold line-clamp-1">{script.title}</p>
        {script.author && <p className="text-xs text-muted-foreground">{script.author}</p>}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Users className="size-3" />{script.player_count_min}-{script.player_count_max}</span>
          <span className="flex items-center gap-1"><Clock className="size-3" />{script.duration_minutes}min</span>
        </div>
        {script.genre_tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {script.genre_tags.slice(0, 3).map((t) => <TagBadge key={t} label={t} className="text-[10px] px-1.5 py-0.5" />)}
          </div>
        )}
      </div>
    </Link>
  )
}
