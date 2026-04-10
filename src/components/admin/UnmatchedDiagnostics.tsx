"use client"

import Link from "next/link"
import { useState } from "react"
import { ChevronDown, ChevronRight, AlertCircle, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { PlayerInfoPopover } from "./PlayerInfoPopover"
import type { EnrichedMember } from "./match-detail-types"

const REASON_LABELS: Record<string, string> = {
  no_common_time: "无共同时段",
  constraint_conflict: "硬约束冲突",
  insufficient_candidates: "候选不足",
  low_score: "匹配分过低",
  unmatched_after_all_stages: "三阶段后未匹配",
}

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
  submissionPrefs?: Record<string, { game_type_pref: string; gender_pref: string }>
  onManualPair?: (memberId: string, name: string) => void
}

export function UnmatchedDiagnostics({ diagnostics, submissionPrefs, onManualPair }: Props) {
  const [open, setOpen] = useState(false)

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
            const reason = REASON_LABELS[d.reason] ?? d.reason

            return (
              <div key={d.id} className="flex items-center justify-between px-4 py-2.5 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium">
                    {d.memberData ? (
                      <PlayerInfoPopover member={d.memberData} submissionPrefs={submissionPrefs}>{name}</PlayerInfoPopover>
                    ) : (
                      name
                    )}
                  </span>
                  <Link
                    href={`/admin/members/${d.member_id}`}
                    className="text-muted-foreground hover:text-primary"
                    title="查看成员详情"
                  >
                    <ExternalLink className="size-3" />
                  </Link>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground rounded-full bg-muted px-2 py-0.5">
                    {reason}
                  </span>
                  {onManualPair && (
                    <button
                      type="button"
                      onClick={() => onManualPair(d.member_id, name)}
                      className="text-xs text-primary hover:underline"
                    >
                      手动配对
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
