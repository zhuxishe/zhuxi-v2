import { requirePlayer } from "@/lib/auth/player"
import { fetchMatchDetail } from "@/lib/queries/matching"
import { fetchReviewedMatchIds } from "@/lib/queries/reviews"
import { getTranslations } from "next-intl/server"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { MatchDetailCard } from "@/components/player/MatchDetailCard"
import { CancellationStatus } from "@/components/player/CancellationStatus"
import { CancelRequestForm } from "@/components/player/CancelRequestForm"

type Params = Promise<{ id: string }>

export default async function MatchDetailPage({ params }: { params: Params }) {
  const { id } = await params
  const player = await requirePlayer()
  const t = await getTranslations("playerMatches")
  const [match, reviewedIds] = await Promise.all([
    fetchMatchDetail(id, player.memberId),
    fetchReviewedMatchIds(player.memberId),
  ])

  if (!match) notFound()

  const groupMembers = match.group_members as string[] | null
  const isGroup = Array.isArray(groupMembers) && groupMembers.length > 0
  const partner = isGroup
    ? { name: `${groupMembers.length}人组`, hobbyTags: [] as string[], gameTypePref: null, scenarioThemeTags: [] as string[], expressionStyleTags: [] as string[], groupRoleTags: [] as string[] }
    : extractPartner(match, player.memberId)

  const session = unwrap(match.session) as { session_name?: string } | undefined
  const canCancel = match.status !== "cancelled" && !match.cancellation_status

  // 预解析翻译字符串（不能把函数传给 client 组件）
  const labels = {
    partner: t("partner"),
    unknown: t("unknown"),
    interests: t("interests"),
    socialStyle: t("socialStyle"),
    gameType: t("gameType"),
    review: t("review"),
    reviewed: t("reviewed"),
    requestCancel: t("requestCancel"),
    cancelFormTitle: t("cancelFormTitle"),
    cancelReasonPlaceholder: t("cancelReasonPlaceholder"),
    cancelBack: t("cancelBack"),
    confirmCancel: t("confirmCancel"),
    submitting: t("submitting"),
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/app/matches"
          className="rounded-full p-1.5 hover:bg-muted transition-colors"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="heading-display text-xl">{t("detailTitle")}</h1>
      </div>

      <MatchDetailCard
        partner={partner}
        sessionName={session?.session_name ?? ""}
        reviewed={reviewedIds.has(match.id)}
        matchId={match.id}
        isGroup={isGroup}
        labels={labels}
      />

      {match.cancellation_status && (
        <CancellationStatus
          status={match.cancellation_status}
          cancelPending={t("cancelPending")}
          cancelPendingHint={t("cancelPendingHint")}
          cancelApproved={t("cancelApproved")}
          cancelRejected={t("cancelRejected")}
          cancelRejectedHint={t("cancelRejectedHint")}
        />
      )}

      {canCancel && (
        <CancelRequestForm matchId={match.id} labels={labels} />
      )}
    </div>
  )
}

function unwrap(v: unknown) {
  return (Array.isArray(v) ? v[0] : v) as Record<string, unknown> | undefined
}

function extractPartner(m: Record<string, unknown>, myId: string) {
  const memberA = unwrap(m.member_a)
  const memberB = unwrap(m.member_b)
  const isA = (memberA?.id as string) === myId
  const other = isA ? memberB : memberA
  const identity = unwrap(other?.member_identity)
  const interests = unwrap(other?.member_interests)
  const personality = unwrap(other?.member_personality)

  return {
    name: String(identity?.full_name ?? identity?.nickname ?? ""),
    hobbyTags: asStringArray(identity?.hobby_tags),
    gameTypePref: (interests?.game_type_pref as string) ?? null,
    scenarioThemeTags: asStringArray(interests?.scenario_theme_tags),
    expressionStyleTags: asStringArray(personality?.expression_style_tags),
    groupRoleTags: asStringArray(personality?.group_role_tags),
  }
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
}
