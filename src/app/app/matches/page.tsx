import { requirePlayer } from "@/lib/auth/player"
import { fetchPlayerMatches } from "@/lib/queries/matching"
import { fetchPlayerMatchHistory } from "@/lib/queries/player-history"
import { fetchReviewedMatchIds } from "@/lib/queries/reviews"
import { fetchGroupMemberNames } from "@/lib/queries/group-members"
import { getTranslations, getLocale } from "next-intl/server"
import { EmptyState } from "@/components/shared/EmptyState"
import { MatchCard } from "@/components/player/MatchCard"
import { Users } from "lucide-react"

export default async function PlayerMatchesPage() {
  const player = await requirePlayer()
  const t = await getTranslations("playerMatches")
  const locale = await getLocale()
  const dateFmt = locale === "ja" ? "ja-JP" : "zh-CN"

  const labels = {
    partner: t("partner"),
    interests: t("interests"),
    socialStyle: t("socialStyle"),
    gameType: t("gameType"),
    review: t("review"),
    reviewed: t("reviewed"),
    cancelBadgePending: t("cancelBadgePending"),
    cancelBadgeApproved: t("cancelBadgeApproved"),
    cancelBadgeRejected: t("cancelBadgeRejected"),
    matchEnded: t("matchEnded"),
  }

  const [matches, history, reviewedIds] = await Promise.all([
    fetchPlayerMatches(player.memberId),
    fetchPlayerMatchHistory(player.memberId),
    fetchReviewedMatchIds(player.memberId),
  ])

  // 批量解析所有组匹配的成员名字（当前 + 历史合并）
  const allGroupIds = new Set<string>()
  for (const m of [...matches, ...history]) {
    const gm = m.group_members as string[] | null
    if (Array.isArray(gm)) gm.forEach((id) => { if (id !== player.memberId) allGroupIds.add(id) })
  }
  const groupNameList = await fetchGroupMemberNames([...allGroupIds])
  const nameMap = new Map(groupNameList.map((g) => [g.id, g.name]))

  if (matches.length === 0 && history.length === 0) {
    return (
      <div className="p-6">
        <h1 className="heading-display text-2xl mb-6">{t("title")}</h1>
        <EmptyState icon={Users} title={t("emptyTitle")} description={t("emptyDescription")} />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="heading-display text-2xl">{t("title")}</h1>

      {matches.map((m) => renderCard(m, player.memberId, nameMap, reviewedIds, dateFmt, labels))}

      {history.length > 0 && (
        <>
          <div className="border-t border-border pt-4 mt-6">
            <h2 className="text-sm font-medium text-muted-foreground mb-3">{t("historyTitle")}</h2>
          </div>
          {history.map((m) => renderCard(m, player.memberId, nameMap, reviewedIds, dateFmt, labels, "history"))}
        </>
      )}
    </div>
  )
}

type CardLabels = {
  partner: string; interests: string; socialStyle: string; gameType: string
  review: string; reviewed: string; cancelBadgePending: string
  cancelBadgeApproved: string; cancelBadgeRejected: string; matchEnded?: string
}

function renderCard(
  m: Record<string, unknown>,
  myId: string,
  nameMap: Map<string, string>,
  reviewedIds: Set<string>,
  dateFmt: string,
  labels: CardLabels,
  variant?: "current" | "history",
) {
  const session = unwrap(m.session) as { session_name?: string } | undefined
  const groupMembers = m.group_members as string[] | null
  const isGroup = Array.isArray(groupMembers) && groupMembers.length > 0
  const partner = isGroup
    ? { name: `${groupMembers.length}人组`, hobbyTags: [] as string[], gameTypePref: null, scenarioThemeTags: [] as string[], expressionStyleTags: [] as string[], groupRoleTags: [] as string[] }
    : extractPartner(m, myId)
  const memberNames = isGroup
    ? groupMembers.filter((id) => id !== myId).map((id) => nameMap.get(id) ?? "").filter(Boolean)
    : undefined

  return (
    <MatchCard
      key={m.id as string}
      matchId={m.id as string}
      partner={partner}
      sessionName={session?.session_name ?? ""}
      date={m.created_at ? new Date(m.created_at as string).toLocaleDateString(dateFmt) : ""}
      reviewed={reviewedIds.has(m.id as string)}
      cancellationStatus={m.cancellation_status as string | null}
      isGroup={isGroup}
      groupMemberNames={memberNames}
      variant={variant}
      labels={labels}
    />
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
