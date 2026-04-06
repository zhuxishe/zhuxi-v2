"use client"

import { Lock, Unlock, Scissors, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScoreBreakdownChart } from "./ScoreBreakdownChart"

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  draft: { label: "草稿", className: "bg-gray-100 text-gray-700" },
  confirmed: { label: "已确认", className: "bg-green-100 text-green-800" },
  locked: { label: "已锁定", className: "bg-blue-100 text-blue-800" },
  cancelled: { label: "已取消", className: "bg-red-100 text-red-700" },
}

interface MemberInfo {
  id: string
  member_number: string | null
  member_identity: {
    full_name: string
    nickname: string | null
    school_name: string | null
  } | null
}

interface Props {
  result: {
    id: string
    total_score: number
    rank: number
    status: string
    best_slot: string | null
    score_breakdown: Record<string, any> | null
    member_a: MemberInfo | null
    member_b: MemberInfo | null
  }
  onLock?: (id: string) => void
  onSplit?: (id: string) => void
  onRestore?: (id: string) => void
}

function memberLabel(m: MemberInfo | null): string {
  if (!m?.member_identity) return "未知"
  const name = m.member_identity.nickname || m.member_identity.full_name
  const school = m.member_identity.school_name
  return school ? `${name} (${school})` : name
}

function scoreColor(score: number): string {
  if (score >= 70) return "text-green-700"
  if (score >= 40) return "text-amber-600"
  return "text-red-600"
}

export function MatchPairCard({ result, onLock, onSplit, onRestore }: Props) {
  const { id, total_score, rank, status, best_slot, score_breakdown } = result
  const badge = STATUS_STYLES[status] ?? STATUS_STYLES.draft

  return (
    <div className="rounded-xl bg-card ring-1 ring-foreground/10 divide-y divide-border">
      {/* Header: rank + status */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="text-sm font-semibold">#{rank}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", badge.className)}>
          {badge.label}
        </span>
      </div>

      {/* Member pair */}
      <div className="px-4 py-3 space-y-1">
        <p className="text-sm font-medium">
          {memberLabel(result.member_a)}
          <span className="mx-2 text-muted-foreground">--</span>
          {memberLabel(result.member_b)}
        </p>
        {best_slot && (
          <p className="text-xs text-muted-foreground">
            最佳时段: {best_slot}
          </p>
        )}
      </div>

      {/* Score + breakdown */}
      <div className="px-4 py-3 space-y-3">
        <p className="text-sm">
          总分: <span className={cn("font-bold", scoreColor(total_score))}>{total_score}</span>
        </p>
        {score_breakdown && <ScoreBreakdownChart breakdown={score_breakdown} />}
      </div>

      {/* Actions */}
      <div className="px-4 py-2.5 flex gap-2">
        {status === "draft" && (
          <>
            {onLock && (
              <Button variant="outline" size="sm" onClick={() => onLock(id)}>
                <Lock className="size-3.5" /> 锁定
              </Button>
            )}
            {onSplit && (
              <Button variant="destructive" size="sm" onClick={() => onSplit(id)}>
                <Scissors className="size-3.5" /> 拆散
              </Button>
            )}
          </>
        )}
        {status === "locked" && onLock && (
          <Button variant="outline" size="sm" onClick={() => onLock(id)}>
            <Unlock className="size-3.5" /> 解锁
          </Button>
        )}
        {status === "cancelled" && onRestore && (
          <Button variant="outline" size="sm" onClick={() => onRestore(id)}>
            <RotateCcw className="size-3.5" /> 恢复
          </Button>
        )}
      </div>
    </div>
  )
}
