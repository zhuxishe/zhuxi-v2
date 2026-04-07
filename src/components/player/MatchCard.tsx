import Link from "next/link"
import { MessageSquare, CheckCircle } from "lucide-react"
import { TagBadge } from "@/components/shared/TagBadge"

interface PartnerProfile {
  name: string
  hobbyTags: string[]
  gameTypePref: string | null
  scenarioThemeTags: string[]
  expressionStyleTags: string[]
  groupRoleTags: string[]
}

interface MatchCardProps {
  matchId: string
  partner: PartnerProfile
  sessionName: string
  date: string
  reviewed: boolean
  cancellationStatus?: string | null
  t: (key: string) => string
}

export function MatchCard({ matchId, partner, sessionName, date, reviewed, cancellationStatus, t }: MatchCardProps) {
  const allTags = buildTagList(partner, t)

  return (
    <Link href={`/app/matches/${matchId}`} className="block rounded-xl bg-card p-4 shadow-soft hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">
            {t("partner")}: {partner.name}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {sessionName} · {date}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {cancellationStatus && <CancelBadge status={cancellationStatus} t={t} />}
          <ReviewButton matchId={matchId} reviewed={reviewed} t={t} />
        </div>
      </div>

      {allTags.length > 0 && (
        <div className="mt-3 space-y-2">
          {allTags.map((group) => (
            <div key={group.label}>
              <p className="text-[11px] text-muted-foreground mb-1">{group.label}</p>
              <div className="flex flex-wrap gap-1">
                {group.tags.map((tag) => (
                  <TagBadge key={tag} label={tag} variant={group.variant} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Link>
  )
}

type TagVariant = "default" | "secondary" | "outline" | "success" | "warning" | "danger" | "info"

interface TagGroup {
  label: string
  tags: string[]
  variant: TagVariant
}

function buildTagList(partner: PartnerProfile, t: (key: string) => string): TagGroup[] {
  const groups: TagGroup[] = []

  if (partner.hobbyTags.length > 0) {
    groups.push({ label: t("interests"), tags: partner.hobbyTags.slice(0, 5), variant: "info" })
  }

  const socialTags = [...partner.expressionStyleTags, ...partner.groupRoleTags]
  if (socialTags.length > 0) {
    groups.push({ label: t("socialStyle"), tags: socialTags.slice(0, 4), variant: "secondary" })
  }

  const gameTags: string[] = []
  if (partner.gameTypePref) gameTags.push(partner.gameTypePref)
  gameTags.push(...partner.scenarioThemeTags.slice(0, 3))
  if (gameTags.length > 0) {
    groups.push({ label: t("gameType"), tags: gameTags, variant: "outline" })
  }

  return groups
}

function ReviewButton({ matchId, reviewed, t }: { matchId: string; reviewed: boolean; t: (key: string) => string }) {
  if (reviewed) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <CheckCircle className="size-3.5" /> {t("reviewed")}
      </span>
    )
  }

  return (
    <span
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 rounded-full bg-sakura/10 px-3 py-1 text-xs font-medium text-sakura hover:bg-sakura/20 transition-colors"
    >
      <MessageSquare className="size-3.5" /> {t("review")}
    </span>
  )
}

function CancelBadge({ status, t }: { status: string; t: (key: string) => string }) {
  const styles: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
  }
  const labels: Record<string, string> = {
    pending: t("cancelBadgePending"),
    approved: t("cancelBadgeApproved"),
    rejected: t("cancelBadgeRejected"),
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${styles[status] ?? ""}`}>
      {labels[status] ?? status}
    </span>
  )
}
