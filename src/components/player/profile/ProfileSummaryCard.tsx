import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { ProfileAvatar } from "./ProfileAvatar"

export interface ProfileSummaryCardLabels {
  nicknameUnset: string
  schoolUnset: string
  memberNumber: string
  memberNumberPending: string
  level: string
  matchScore: string
  activities: string
  matchScorePending: string
  activityUnit: string
  editProfile: string
}

interface ProfileSummaryCardProps {
  avatarUrl: string | null
  nickname: string | null
  fullName: string
  schoolName: string | null
  memberNumber: string | null
  levelLabel: string
  matchScore: number | null
  activityCount: number
  labels: ProfileSummaryCardLabels
}

export function ProfileSummaryCard({
  avatarUrl,
  nickname,
  fullName,
  schoolName,
  memberNumber,
  levelLabel,
  matchScore,
  activityCount,
  labels,
}: ProfileSummaryCardProps) {
  return (
    <section className="overflow-hidden rounded-[22px] border border-border/90 bg-card shadow-soft">
      <Link
        href="/app/profile/edit"
        aria-label={labels.editProfile}
        className="flex min-h-[6.75rem] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
      >
        <ProfileAvatar src={avatarUrl} alt={nickname || fullName} size="lg" priority />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-lg font-semibold leading-6 tracking-tight ${nickname ? "text-foreground" : "text-muted-foreground"}`}>
            {nickname || labels.nicknameUnset}
          </span>
          <span className="mt-1 block truncate text-sm leading-4 text-muted-foreground">{fullName}</span>
          <span className="mt-0.5 block truncate text-sm leading-4 text-muted-foreground">
            {schoolName || labels.schoolUnset}
          </span>
          <span className="mt-0.5 block truncate text-xs leading-4 text-muted-foreground">
            {memberNumber ? `${labels.memberNumber} ${memberNumber}` : labels.memberNumberPending}
          </span>
        </span>
      </Link>

      <div className="grid min-h-[4.25rem] grid-cols-3 border-t border-border/80 bg-secondary/65 px-2 py-2.5">
        <Stat label={labels.level} value={levelLabel} />
        <Stat
          label={labels.matchScore}
          value={matchScore == null ? labels.matchScorePending : matchScore.toFixed(1)}
          bordered
          compact={matchScore == null}
        />
        <Stat
          label={labels.activities}
          value={`${activityCount} ${labels.activityUnit}`}
          href="/app/profile/stats"
          bordered
        />
      </div>
    </section>
  )
}

function Stat({
  label,
  value,
  href,
  bordered = false,
  compact = false,
}: {
  label: string
  value: string
  href?: string
  bordered?: boolean
  compact?: boolean
}) {
  const content = (
    <>
      <span className="text-[11px] leading-4 text-muted-foreground">{label}</span>
      <span className="mt-1 flex max-w-full items-center justify-center gap-0.5">
        <span className={`max-w-full break-words font-semibold leading-5 text-primary ${compact ? "text-xs" : "text-base"}`}>
          {value}
        </span>
        {href && (
          <ChevronRight
            className="size-3.5 shrink-0 text-primary/70 transition-transform group-hover:translate-x-0.5"
            strokeWidth={1.8}
            aria-hidden="true"
          />
        )}
      </span>
    </>
  )

  const className = `flex min-w-0 flex-col items-center justify-center px-1 text-center ${bordered ? "border-l border-border" : ""}`

  if (href) {
    return (
      <Link
        href={href}
        className={`group transition-colors hover:bg-muted/30 active:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset ${className}`}
      >
        {content}
      </Link>
    )
  }

  return <div className={className}>{content}</div>
}
