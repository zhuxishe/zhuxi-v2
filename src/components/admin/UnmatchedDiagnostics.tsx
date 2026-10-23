"use client"

import Link from "next/link"
import { useState } from "react"
import { ChevronDown, ChevronRight, AlertCircle, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { unmatchedDiagnosticMessages } from "@/lib/matching/unmatched-diagnostic-display"
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
  canViewRawSubmissions?: boolean
  onManualPair?: (memberId: string, name: string) => void
}

export function UnmatchedDiagnostics({ diagnostics, submissionPrefs, canViewRawSubmissions = false, onManualPair }: Props) {
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
            const reasons = canViewRawSubmissions
              ? unmatchedDiagnosticMessages(d.details)
              : ["原始问卷与详细诊断已隐藏；配对校验仍在服务端执行"]

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
