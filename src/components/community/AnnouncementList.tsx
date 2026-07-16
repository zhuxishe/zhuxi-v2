"use client"

import Link from "next/link"
import { useId, useState } from "react"
import { ArrowRight, ChevronDown, ExternalLink } from "lucide-react"
import type {
  CommunityLocale,
  LocalizedAnnouncement,
} from "@/lib/community/types"
import { cn } from "@/lib/utils"
import { formatCommunityDate } from "./community-format"

export interface AnnouncementListLabels {
  pinned: string
  expand: string
  collapse: string
  fallbackLanguage: Record<CommunityLocale, string>
}

interface AnnouncementListProps {
  announcements: LocalizedAnnouncement[]
  locale: CommunityLocale
  labels: AnnouncementListLabels
  initiallyExpandedIds?: readonly string[]
  className?: string
}

const EMPTY_IDS: readonly string[] = []

export function AnnouncementList({
  announcements,
  locale,
  labels,
  initiallyExpandedIds = EMPTY_IDS,
  className,
}: AnnouncementListProps) {
  const [expandedIds, setExpandedIds] = useState(() => new Set(initiallyExpandedIds))

  function toggle(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className={cn("space-y-3", className)}>
      {announcements.map((announcement) => (
        <AnnouncementItem
          key={announcement.id}
          announcement={announcement}
          locale={locale}
          labels={labels}
          expanded={expandedIds.has(announcement.id)}
          onToggle={() => toggle(announcement.id)}
        />
      ))}
    </div>
  )
}

function AnnouncementItem({
  announcement,
  locale,
  labels,
  expanded,
  onToggle,
}: {
  announcement: LocalizedAnnouncement
  locale: CommunityLocale
  labels: AnnouncementListLabels
  expanded: boolean
  onToggle: () => void
}) {
  const id = useId()
  const contentId = `${id}-content`
  const date = formatCommunityDate(announcement.publishedAt, locale, { dateOnly: true })

  return (
    <article className="overflow-hidden rounded-[20px] bg-card shadow-soft">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={onToggle}
        className={cn(
          "w-full rounded-[20px] p-4 text-left transition-colors hover:bg-secondary/45",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
          "motion-reduce:transition-none",
        )}
      >
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-1.5">
              {announcement.isPinned ? (
                <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
                  {labels.pinned}
                </span>
              ) : null}
              {announcement.fallbackLocale ? (
                <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {labels.fallbackLanguage[announcement.fallbackLocale]}
                </span>
              ) : null}
            </span>
            <span className="mt-2 block text-[15px] font-semibold leading-6 text-foreground">
              {announcement.title}
            </span>
          </span>
          {date ? <time className="shrink-0 pt-0.5 text-xs text-muted-foreground">{date}</time> : null}
        </span>
        <span className="mt-2 flex items-end gap-3">
          <span className="line-clamp-2 flex-1 text-sm leading-6 text-muted-foreground">
            {announcement.summary}
          </span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-primary transition-transform motion-reduce:transition-none",
              expanded && "rotate-180",
            )}
            aria-hidden="true"
          />
        </span>
        <span className="sr-only">{expanded ? labels.collapse : labels.expand}</span>
      </button>

      {expanded ? (
        <div id={contentId} className="border-t border-border px-4 pb-4 pt-3">
          <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">{announcement.body}</p>
          <p className="mt-3 text-xs text-muted-foreground">{announcement.publisherName}</p>
          {announcement.linkUrl && announcement.linkText ? (
            <AnnouncementLink href={announcement.linkUrl} label={announcement.linkText} />
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

function AnnouncementLink({ href, label }: { href: string; label: string }) {
  const external = /^https?:\/\//i.test(href)
  const internal = href.startsWith("/") && !href.startsWith("//")
  if (!external && !internal) return null
  const Icon = external ? ExternalLink : ArrowRight
  return (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      {label}
      <Icon className="size-4" aria-hidden="true" />
    </Link>
  )
}
