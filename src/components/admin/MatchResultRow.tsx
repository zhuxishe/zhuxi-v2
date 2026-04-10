"use client"

import { Badge } from "@/components/ui/badge"
import { PlayerInfoPopover } from "./PlayerInfoPopover"
import type { EnrichedMatchResult, PairRelationship, EnrichedMember } from "./match-detail-types"

interface Props {
  result: EnrichedMatchResult
  index: number
  pairRel?: PairRelationship | null
  submissionPrefs?: Record<string, { game_type_pref: string; gender_pref: string }>
}

function getMemberName(m: EnrichedMember | null): string {
  if (!m?.member_identity) return "未知"
  return m.member_identity.full_name ?? m.member_identity.nickname ?? "未知"
}

function getSchool(m: EnrichedMember | null): string {
  return m?.member_identity?.school_name ?? "-"
}

function scoreColorClass(score: number): string {
  if (score >= 60) return "bg-green-500/10 text-green-700"
  if (score >= 40) return "bg-amber-500/10 text-amber-700"
  return "bg-red-500/10 text-red-700"
}

const REL_STATUS_MAP: Record<string, { label: string; className: string }> = {
  good_partner: { label: "好搭档", className: "bg-pink-50 text-pink-700" },
  reunion: { label: "重逢", className: "bg-pink-50 text-pink-700" },
  cooldown: { label: "冷却期", className: "bg-amber-50 text-amber-700" },
  normal: { label: "正常", className: "bg-gray-50 text-gray-600" },
}

export function MatchResultRow({ result: r, index, pairRel, submissionPrefs }: Props) {
  const aId = r.member_a?.id
  const gameType = (aId && submissionPrefs?.[aId]?.game_type_pref) || undefined

  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/20">
      {/* Rank */}
      <td className="px-4 py-3 text-muted-foreground">{r.rank ?? index + 1}</td>

      {/* Player A */}
      <td className="px-4 py-3">
        <PlayerInfoPopover member={r.member_a} submissionPrefs={submissionPrefs}>
          {getMemberName(r.member_a)}
        </PlayerInfoPopover>
      </td>

      {/* Player B */}
      <td className="px-4 py-3">
        <PlayerInfoPopover member={r.member_b} submissionPrefs={submissionPrefs}>
          {getMemberName(r.member_b)}
        </PlayerInfoPopover>
      </td>

      {/* Schools */}
      <td className="px-4 py-3 text-muted-foreground text-xs">
        {getSchool(r.member_a)} / {getSchool(r.member_b)}
      </td>

      {/* Game type + time slot */}
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {gameType && (
            <Badge variant="outline" className="text-xs font-normal">{gameType}</Badge>
          )}
          {r.best_slot && (
            <Badge variant="outline" className="text-xs font-normal">{r.best_slot}</Badge>
          )}
        </div>
      </td>

      {/* Pair relationship */}
      <td className="px-4 py-3">
        {pairRel && pairRel.pair_count > 0 && (
          <PairRelBadge rel={pairRel} />
        )}
      </td>

      {/* Score with color */}
      <td className="px-4 py-3 text-right">
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${scoreColorClass(r.total_score)}`}>
          {typeof r.total_score === "number" ? r.total_score.toFixed(1) : r.total_score}
        </span>
      </td>
    </tr>
  )
}

function PairRelBadge({ rel }: { rel: PairRelationship }) {
  const info = REL_STATUS_MAP[rel.status] ?? REL_STATUS_MAP.normal
  return (
    <Badge variant="outline" className={`text-xs font-normal ${info.className}`}>
      {info.label} ({rel.pair_count}次)
    </Badge>
  )
}
