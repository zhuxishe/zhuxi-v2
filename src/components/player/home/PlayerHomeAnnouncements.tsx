import Link from "next/link"
import { ChevronRight, Megaphone } from "lucide-react"
import type { PlayerHomeAnnouncementItem } from "./types"

export function PlayerHomeAnnouncements({
  items,
  title,
}: {
  items: PlayerHomeAnnouncementItem[]
  title: string
}) {
  if (items.length === 0) return null

  return (
    <section aria-labelledby="player-home-announcements-title">
      <h2 id="player-home-announcements-title" className="text-base font-semibold tracking-tight">{title}</h2>
      <div className="mt-2 divide-y divide-border border-y border-border">
        {items.slice(0, 2).map((item) => (
          <Link
            key={item.id}
            href={`/app/community?tab=announcements&announcement=${item.id}`}
            className="flex min-h-14 items-center gap-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <Megaphone className="size-[18px]" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  )
}
