import type { ComponentProps } from "react"
import { MatchCard } from "@/components/player/MatchCard"

interface Props {
  match: Record<string, unknown>
  memberId: string
  nameMap: Map<string, string>
  reviewedIds: Set<string>
  dateFmt: string
  labels: ComponentProps<typeof MatchCard>["labels"]
  variant?: "current" | "history"
}

export function PlayerMatchResultCard({ match, memberId, nameMap, reviewedIds, dateFmt, labels, variant }: Props) {
  const session = unwrap(match.session)
  const groupMembers = match.group_members as string[] | null
  const isGroup = Array.isArray(groupMembers) && groupMembers.length > 0
  const partner = isGroup
    ? { name: `${groupMembers.length}人组`, hobbyTags: [] as string[], gameTypePref: null, scenarioThemeTags: [] as string[], expressionStyleTags: [] as string[], groupRoleTags: [] as string[] }
    : extractPartner(match, memberId)
  const memberNames = isGroup
    ? groupMembers.filter((id) => id !== memberId).map((id) => nameMap.get(id) ?? "").filter(Boolean)
    : undefined

  return <MatchCard
    matchId={match.id as string}
    partner={partner}
    sessionName={String(session?.session_name ?? "")}
    date={match.created_at ? new Date(match.created_at as string).toLocaleDateString(dateFmt) : ""}
    reviewed={reviewedIds.has(match.id as string)}
    cancellationStatus={match.cancellation_status as string | null}
    isGroup={isGroup}
    groupMemberNames={memberNames}
    variant={variant}
    labels={labels}
  />
}

function unwrap(value: unknown) {
  return (Array.isArray(value) ? value[0] : value) as Record<string, unknown> | undefined
}

function extractPartner(match: Record<string, unknown>, memberId: string) {
  const memberA = unwrap(match.member_a)
  const memberB = unwrap(match.member_b)
  const other = memberA?.id === memberId ? memberB : memberA
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

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}
