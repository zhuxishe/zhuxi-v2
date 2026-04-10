"use client"

import { Lock, Unlock, Scissors, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScoreBreakdownChart } from "./ScoreBreakdownChart"
import { ConstraintChecklist } from "./ConstraintChecklist"
import { PlayerInfoPopover } from "./PlayerInfoPopover"
import type { EnrichedMember, PairRelationship } from "./match-detail-types"

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  draft: { label: "草稿", className: "bg-gray-100 text-gray-700" },
  confirmed: { label: "已确认", className: "bg-green-100 text-green-800" },
  locked: { label: "已锁定", className: "bg-blue-100 text-blue-800" },
  cancelled: { label: "已取消", className: "bg-red-100 text-red-700" },
}

interface Props {
  result: {
    id: string
    total_score: number
    rank: number | null
    status: string
    best_slot: string | null
    score_breakdown: unknown
    member_a: EnrichedMember | null
    member_b: EnrichedMember | null
    group_members: string[] | null
    group_member_details: EnrichedMember[] | null
  }
  pairRel?: PairRelationship | null
  submissionPrefs?: Record<string, { game_type_pref: string; gender_pref: string }>
  onLock?: (id: string) => void
  onSplit?: (id: string) => void
  onRestore?: (id: string) => void
}

function memberLabel(m: EnrichedMember | null): string {
  if (!m?.member_identity) return "未知"
  return m.member_identity.full_name || m.member_identity.nickname || "未知"
}

function scoreColor(score: number): string {
  if (score >= 60) return "text-green-700"
  if (score >= 40) return "text-amber-600"
  return "text-red-600"
}

function scoreBgClass(score: number): string {
  if (score >= 60) return "bg-green-500/10"
  if (score >= 40) return "bg-amber-500/10"
  return "bg-red-500/10"
}

export function MatchPairCard({ result, pairRel, submissionPrefs = {}, onLock, onSplit, onRestore }: Props) {
  const { id, total_score, rank, status, best_slot, score_breakdown } = result
  const badge = STATUS_STYLES[status] ?? STATUS_STYLES.draft
  const aId = result.member_a?.id
  const gameType = (aId && submissionPrefs[aId]?.game_type_pref) || result.member_a?.member_interests?.game_type_pref

  return (
    <div className="rounded-xl bg-card ring-1 ring-foreground/10 divide-y divide-border">
      {/* Header: rank + status */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="text-sm font-semibold">#{rank}</span>
        <div className="flex items-center gap-2">
          {gameType && <Badge variant="outline" className="text-xs">{gameType}</Badge>}
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", badge.className)}>
            {badge.label}
          </span>
        </div>
      </div>

      {/* Member pair/group with popover */}
      <div className="px-4 py-3 space-y-1.5">
        <p className="text-sm font-medium">
          {result.group_member_details && result.group_member_details.length > 0 ? (
            result.group_member_details.map((m, i) => (
              <span key={(m as EnrichedMember).id}>
                {i > 0 && <span className="mx-2 text-muted-foreground">+</span>}
                <PlayerInfoPopover member={m as EnrichedMember} submissionPrefs={submissionPrefs}>{memberLabel(m as EnrichedMember)}</PlayerInfoPopover>
              </span>
            ))
          ) : (
            <>
              <PlayerInfoPopover member={result.member_a} submissionPrefs={submissionPrefs}>{memberLabel(result.member_a)}</PlayerInfoPopover>
              <span className="mx-2 text-muted-foreground">--</span>
              <PlayerInfoPopover member={result.member_b} submissionPrefs={submissionPrefs}>{memberLabel(result.member_b)}</PlayerInfoPopover>
            </>
          )}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {best_slot && (
            <Badge variant="outline" className="text-xs font-normal">时段: {best_slot}</Badge>
          )}
          <PairRelBadge rel={pairRel} />
        </div>
      </div>

      {/* Constraint checklist */}
      <div className="px-4 py-3">
        <ConstraintChecklist
          memberA={result.member_a}
          memberB={result.member_b}
          groupMembers={result.group_member_details as import("./match-detail-types").EnrichedMember[] | null}
          pairRel={pairRel}
          bestSlot={best_slot}
          submissionPrefs={submissionPrefs}
        />
      </div>

      {/* Score + breakdown */}
      <div className="px-4 py-3 space-y-3">
        <p className="text-sm">
          总分:{" "}
          <span className={cn("font-bold px-1.5 py-0.5 rounded", scoreColor(total_score), scoreBgClass(total_score))}>
            {total_score.toFixed(1)}
          </span>
        </p>
        {score_breakdown != null && (
          <ScoreBreakdownChart
            breakdown={score_breakdown as Record<string, { raw: number; weighted: number; maxRaw: number }>}
          />
        )}
      </div>

      {/* Actions */}
      <ActionBar id={id} status={status} onLock={onLock} onSplit={onSplit} onRestore={onRestore} />
    </div>
  )
}

function PairRelBadge({ rel }: { rel?: PairRelationship | null }) {
  if (!rel || rel.pair_count === 0) return null
  const labels: Record<string, { text: string; cls: string }> = {
    good_partner: { text: "好搭档", cls: "bg-pink-50 text-pink-700" },
    reunion: { text: "重逢", cls: "bg-pink-50 text-pink-700" },
    cooldown: { text: "冷却期", cls: "bg-amber-50 text-amber-700" },
  }
  const info = labels[rel.status] ?? { text: `历史${rel.pair_count}次`, cls: "bg-gray-50 text-gray-600" }
  return <Badge variant="outline" className={`text-xs font-normal ${info.cls}`}>{info.text}</Badge>
}

function ActionBar({ id, status, onLock, onSplit, onRestore }: {
  id: string; status: string
  onLock?: (id: string) => void; onSplit?: (id: string) => void; onRestore?: (id: string) => void
}) {
  return (
    <div className="px-4 py-2.5 flex gap-2">
      {status === "draft" && (
        <>
          {onLock && <Button variant="outline" size="sm" onClick={() => onLock(id)}><Lock className="size-3.5" /> 锁定</Button>}
          {onSplit && <Button variant="destructive" size="sm" onClick={() => onSplit(id)}><Scissors className="size-3.5" /> 拆散</Button>}
        </>
      )}
      {status === "locked" && onLock && <Button variant="outline" size="sm" onClick={() => onLock(id)}><Unlock className="size-3.5" /> 解锁</Button>}
      {status === "cancelled" && onRestore && <Button variant="outline" size="sm" onClick={() => onRestore(id)}><RotateCcw className="size-3.5" /> 恢复</Button>}
    </div>
  )
}
