"use client"

import { useId, useState } from "react"
import { ChevronDown } from "lucide-react"
import type { CommunityLocale, LocalizedFaq } from "@/lib/community/types"
import { cn } from "@/lib/utils"

export interface FaqListLabels {
  expand: string
  collapse: string
  fallbackLanguage: Record<CommunityLocale, string>
}

interface FaqListProps {
  faqs: LocalizedFaq[]
  labels: FaqListLabels
  initiallyExpandedIds?: readonly string[]
  className?: string
}

const EMPTY_IDS: readonly string[] = []

export function FaqList({
  faqs,
  labels,
  initiallyExpandedIds = EMPTY_IDS,
  className,
}: FaqListProps) {
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
      {faqs.map((faq) => (
        <FaqItem
          key={faq.id}
          faq={faq}
          labels={labels}
          expanded={expandedIds.has(faq.id)}
          onToggle={() => toggle(faq.id)}
        />
      ))}
    </div>
  )
}

function FaqItem({
  faq,
  labels,
  expanded,
  onToggle,
}: {
  faq: LocalizedFaq
  labels: FaqListLabels
  expanded: boolean
  onToggle: () => void
}) {
  const id = useId()
  const contentId = `${id}-answer`

  return (
    <article className="overflow-hidden rounded-[20px] bg-card shadow-soft">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={onToggle}
        className={cn(
          "flex min-h-14 w-full items-center gap-3 rounded-[20px] px-4 py-3 text-left transition-colors hover:bg-secondary/45",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
          "motion-reduce:transition-none",
        )}
      >
        <span className="min-w-0 flex-1">
          {faq.fallbackLocale ? (
            <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {labels.fallbackLanguage[faq.fallbackLocale]}
            </span>
          ) : null}
          <span className={cn("block text-[15px] font-semibold leading-6 text-foreground", faq.fallbackLocale && "mt-1.5")}>
            {faq.question}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-primary transition-transform motion-reduce:transition-none",
            expanded && "rotate-180",
          )}
          aria-hidden="true"
        />
        <span className="sr-only">{expanded ? labels.collapse : labels.expand}</span>
      </button>
      {expanded ? (
        <div id={contentId} className="border-t border-border px-4 pb-4 pt-3">
          <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">{faq.answer}</p>
        </div>
      ) : null}
    </article>
  )
}
