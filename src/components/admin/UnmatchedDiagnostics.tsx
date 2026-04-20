"use client"

import Link from "next/link"
import { useState } from "react"
import { ChevronDown, ChevronRight, AlertCircle, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { PlayerInfoPopover } from "./PlayerInfoPopover"
import { displayGender } from "./player-info-format"
import type { EnrichedMember, SubmissionPrefInfo } from "./match-detail-types"

export interface DiagnosticItem {
  id: string
  member_id: string
  reason: string
  details: unknown
  member?: { member_identity?: { full_name: string } | null } | null
  memberData?: EnrichedMember | null
}

interface Props {
  diagnostics: DiagnosticItem[]
  sessionId?: string
  submissionPrefs?: Record<string, SubmissionPrefInfo>
  onManualPair?: (memberId: string, name: string) => void
}

/** 分析未匹配原因 */
function analyzeReasons(
  d: DiagnosticItem,
  allDiags: DiagnosticItem[],
  prefs?: Props["submissionPrefs"],
): string[] {
  const reasons: string[] = []
  const pref = d.member_id ? prefs?.[d.member_id] : undefined

  if (!pref) {
    reasons.push("未找到问卷数据")
    return reasons
  }

  // 1. 游戏类型
  if (pref.game_type_pref === "多人") {
    const otherMulti = allDiags.filter((o) =>
      o.member_id !== d.member_id &&
      prefs?.[o.member_id]?.game_type_pref === "多人",
    )
    if (otherMulti.length < 2) {
      reasons.push(`选择了"多人"，但未匹配的多人偏好者不足3人（仅${otherMulti.length + 1}人），无法组建多人组`)
    }
  }

  // 2. 性别偏好
  if (pref.gender_pref && pref.gender_pref !== "都可以") {
    reasons.push(`性别偏好"${pref.gender_pref}"，限制了可选范围`)
  }

  // 3. 时段
  if (pref.availability) {
    const dates = Object.keys(pref.availability).sort()
    if (dates.length > 0) {
      const range = `${dates[0].replace(/^\d{4}-/, "")}~${dates[dates.length - 1].replace(/^\d{4}-/, "")}`
      // 检查和其他未匹配者的时段重叠
      const others = allDiags.filter((o) => o.member_id !== d.member_id)
      let overlapCount = 0
      for (const other of others) {
        const otherAvail = prefs?.[other.member_id]?.availability
        if (!otherAvail) continue
        const hasOverlap = dates.some((date) =>
          pref.availability?.[date]?.some((slot) => otherAvail[date]?.includes(slot)),
        )
        if (hasOverlap) overlapCount++
      }
      if (overlapCount === 0 && others.length > 0) {
        reasons.push(`可用时段 ${range} 与其他未匹配者完全不重叠`)
      } else if (overlapCount < 2 && pref.game_type_pref === "多人") {
        reasons.push(`可用时段 ${range} 仅与 ${overlapCount} 人重叠，不足以组建多人组`)
      }
    }
  }

  if (reasons.length === 0) {
    reasons.push("约束组合导致无法匹配（多项约束交叉限制）")
  }

  return reasons
}

export function UnmatchedDiagnostics({ diagnostics, submissionPrefs, onManualPair }: Props) {
  const [open, setOpen] = useState(true)

  if (diagnostics.length === 0) return null

  return (
    <div className="rounded-xl bg-card ring-1 ring-foreground/10 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full items-center gap-2 px-4 py-3 text-left",
          "hover:bg-muted/50 transition-colors"
        )}
      >
        {open ? (
          <ChevronDown className="size-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground" />
        )}
        <AlertCircle className="size-4 text-amber-500" />
        <span className="text-sm font-medium">
          未匹配成员 ({diagnostics.length}人)
        </span>
      </button>

      {open && (
        <div className="border-t border-border divide-y divide-border/50">
          {diagnostics.map((d) => {
            const name = d.member?.member_identity?.full_name ?? d.member_id
            const pref = submissionPrefs?.[d.member_id]
            const reasons = analyzeReasons(d, diagnostics, submissionPrefs)

            return (
              <div key={d.id} className="px-4 py-3 space-y-1.5">
                {/* 名字 + 链接 + 手动配对 */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium">
                      {d.memberData ? (
                        <PlayerInfoPopover member={d.memberData} submissionPrefs={submissionPrefs}>{name}</PlayerInfoPopover>
                      ) : name}
                    </span>
                    <Link href={`/admin/members/${d.member_id}`} className="text-muted-foreground hover:text-primary" title="查看详情">
                      <ExternalLink className="size-3" />
                    </Link>
                  </div>
                  {onManualPair && (
                    <button type="button" onClick={() => onManualPair(d.member_id, name)} className="text-xs text-primary hover:underline shrink-0">
                      手动配对
                    </button>
                  )}
                </div>

                {/* 偏好摘要 */}
                {pref && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-muted px-2 py-0.5">{pref.game_type_pref}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5">偏好{pref.gender_pref}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5">
                      {displayGender(d.memberData?.member_identity?.gender)}
                    </span>
                  </div>
                )}

                {/* 详细原因 */}
                <div className="space-y-0.5">
                  {reasons.map((r, i) => (
                    <p key={i} className="text-xs text-amber-700 pl-1 border-l-2 border-amber-300">{r}</p>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
