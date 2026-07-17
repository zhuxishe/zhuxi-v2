import Link from "next/link"
import { ProfileAvatar } from "./ProfileAvatar"

export interface ProfileSummaryCardLabels {
  membership: string
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
    <section className="overflow-hidden rounded-[22px] border border-border/90 bg-card shadow-soft" aria-label={labels.editProfile}>
      <Link
        href="/app/profile/edit"
        aria-label={labels.editProfile}
        className="flex min-h-[6.75rem] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
      >
        <ProfileAvatar src={avatarUrl} alt={nickname || fullName} size="lg" priority />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`truncate text-lg font-semibold leading-6 tracking-tight ${nickname ? "text-foreground" : "text-muted-foreground"}`}>
              {nickname || labels.nicknameUnset}
            </span>
            <span className="shrink-0 rounded-lg border border-primary/70 bg-primary/[0.03] px-2 py-0.5 text-[11px] font-medium leading-5 text-primary">
              {labels.membership}
            </span>
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
        <Stat label={labels.activities} value={`${activityCount} ${labels.activityUnit}`} bordered />
      </div>
    </section>
  )
}

function Stat({
  label,
  value,
  bordered = false,
  compact = false,
}: {
  label: string
  value: string
  bordered?: boolean
  compact?: boolean
}) {
  return (
    <div className={`flex min-w-0 flex-col items-center justify-center px-1 text-center ${bordered ? "border-l border-border" : ""}`}>
      <span className="text-[11px] leading-4 text-muted-foreground">{label}</span>
      <span className={`mt-1 max-w-full break-words font-semibold leading-5 text-primary ${compact ? "text-xs" : "text-base"}`}>
        {value}
      </span>
    </div>
  )
}
