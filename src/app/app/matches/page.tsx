import { requirePlayer } from "@/lib/auth/player"
import { fetchPlayerMatches } from "@/lib/queries/matching"
import { fetchReviewedMatchIds } from "@/lib/queries/reviews"
import { getTranslations, getLocale } from "next-intl/server"
import { EmptyState } from "@/components/shared/EmptyState"
import { MatchCard } from "@/components/player/MatchCard"
import { Users } from "lucide-react"

export default async function PlayerMatchesPage() {
  try {
    const player = await requirePlayer()
    const t = await getTranslations("playerMatches")
    const locale = await getLocale()
    const dateFmt = locale === "ja" ? "ja-JP" : "zh-CN"
    const [matches, reviewedIds] = await Promise.all([
      fetchPlayerMatches(player.memberId),
      fetchReviewedMatchIds(player.memberId),
    ])

    if (matches.length === 0) {
      return (
        <div className="p-6">
          <h1 className="heading-display text-2xl mb-6">{t("title")}</h1>
          <EmptyState
            icon={Users}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
          />
        </div>
      )
    }

    return (
      <div className="p-6 space-y-4">
        <h1 className="heading-display text-2xl">{t("title")}</h1>
        {matches.map((m) => {
          const session = unwrap(m.session) as { session_name?: string } | undefined
          const groupMembers = m.group_members as string[] | null
          const isGroup = Array.isArray(groupMembers) && groupMembers.length > 0

          const partner = isGroup
            ? { name: `${groupMembers.length}人组`, hobbyTags: [] as string[], gameTypePref: null, scenarioThemeTags: [] as string[], expressionStyleTags: [] as string[], groupRoleTags: [] as string[] }
            : extractPartner(m, player.memberId)

          return (
            <MatchCard
              key={m.id}
              matchId={m.id}
              partner={partner}
              sessionName={session?.session_name ?? ""}
              date={m.created_at ? new Date(m.created_at).toLocaleDateString(dateFmt) : ""}
              reviewed={reviewedIds.has(m.id)}
              cancellationStatus={(m as Record<string, unknown>).cancellation_status as string | null}
              t={(key: string) => t(key)}
              isGroup={isGroup}
            />
          )
        })}
      </div>
    )
  } catch (err) {
    // 临时诊断：直接显示错误，不走 error boundary
    const msg = err instanceof Error ? `${err.message}\n\n${err.stack}` : String(err)
    return (
      <div className="p-4">
        <h2 className="text-sm font-bold text-red-600 mb-2">调试信息（临时）</h2>
        <pre className="text-xs text-red-600 whitespace-pre-wrap bg-red-50 p-3 rounded">{msg}</pre>
      </div>
    )
  }
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
