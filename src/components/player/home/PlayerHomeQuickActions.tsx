"use client"

import Link from "next/link"
import { useState, type ComponentType } from "react"
import { BookOpen, CalendarDays, ClipboardCheck, MessageSquareText } from "lucide-react"
import { PlayerFeedbackDialog } from "./PlayerFeedbackDialog"
import { PlayerRecruitingSheet } from "./PlayerRecruitingSheet"
import type { PlayerHomeActivityItem } from "./types"

interface Props {
  activities: PlayerHomeActivityItem[]
  locale: string
  pendingReviewCount: number
  pendingReviewHref: string
  labels: {
    ariaLabel: string
    recruiting: string
    reviews: string
    history: string
    feedback: string
    recruitingSheet: Parameters<typeof PlayerRecruitingSheet>[0]["labels"]
    feedbackDialog: Parameters<typeof PlayerFeedbackDialog>[0]["labels"]
  }
}

export function PlayerHomeQuickActions({ activities, locale, pendingReviewCount, pendingReviewHref, labels }: Props) {
  const [recruitingOpen, setRecruitingOpen] = useState(false)
  const [feedbackSubmissionId, setFeedbackSubmissionId] = useState<string | null>(null)

  return (
    <>
      <nav aria-label={labels.ariaLabel} className="grid grid-cols-4 divide-x divide-border">
        <QuickButton icon={CalendarDays} label={labels.recruiting} onClick={() => setRecruitingOpen(true)} />
        <QuickLink icon={ClipboardCheck} label={labels.reviews} href={pendingReviewHref} badge={pendingReviewCount} />
        <QuickLink icon={BookOpen} label={labels.history} href="/app/profile/stats" />
        <QuickButton icon={MessageSquareText} label={labels.feedback} onClick={() => setFeedbackSubmissionId(crypto.randomUUID())} />
      </nav>

      {recruitingOpen && <PlayerRecruitingSheet activities={activities} locale={locale} labels={labels.recruitingSheet} onClose={() => setRecruitingOpen(false)} />}
      {feedbackSubmissionId && (
        <PlayerFeedbackDialog
          locale={locale}
          labels={labels.feedbackDialog}
          submissionId={feedbackSubmissionId}
          onClose={() => setFeedbackSubmissionId(null)}
        />
      )}
    </>
  )
}

type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>

function QuickLink({ icon: IconComponent, label, href, badge = 0 }: { icon: Icon; label: string; href: string; badge?: number }) {
  return (
    <Link href={href} className="relative flex h-[54px] min-w-0 flex-col items-center justify-center gap-1 px-1 text-center text-xs font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset">
      <span className="relative grid size-8 place-items-center text-primary">
        <IconComponent className="size-6" aria-hidden={true} />
        {badge > 0 && <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-5 text-primary-foreground">{badge > 99 ? "99+" : badge}</span>}
      </span>
      <span className="max-w-full truncate">{label}</span>
    </Link>
  )
}

function QuickButton({ icon: IconComponent, label, onClick }: { icon: Icon; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex h-[54px] min-w-0 flex-col items-center justify-center gap-1 px-1 text-center text-xs font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset">
      <span className="grid size-8 place-items-center text-primary"><IconComponent className="size-6" aria-hidden={true} /></span>
      <span className="max-w-full truncate">{label}</span>
    </button>
  )
}
