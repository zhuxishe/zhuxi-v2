import { requirePlayer } from "@/lib/auth/player"
import { fetchPlayerMatches } from "@/lib/queries/matching"
import { fetchReviewedMatchIds } from "@/lib/queries/reviews"
import { getTranslations } from "next-intl/server"
import { EmptyState } from "@/components/shared/EmptyState"
import { MatchCard } from "@/components/player/MatchCard"
import { Users } from "lucide-react"

export default async function PlayerMatchesPage() {
  const player = await requirePlayer()
  const t = await getTranslations("playerMatches")
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
        const partner = extractPartner(m, player.memberId)
        const session = unwrap(m.session) as { session_name?: string } | undefined

        return (
          <MatchCard
            key={m.id}
            matchId={m.id}
            partner={partner}
            sessionName={session?.session_name ?? ""}
            date={new Date(m.created_at).toLocaleDateString("zh-CN")}
            reviewed={reviewedIds.has(m.id)}
            t={(key: string) => t(key)}
          />
        )
      })}
    </div>
  )
}

// Supabase nested joins may return array or object
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
