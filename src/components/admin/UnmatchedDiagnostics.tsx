"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

const REASON_LABELS: Record<string, string> = {
  no_common_time: "无共同时段",
  constraint_conflict: "硬约束冲突",
  insufficient_candidates: "候选不足",
  low_score: "匹配分过低",
  unmatched_after_all_stages: "三阶段后未匹配",
}

interface DiagnosticItem {
  id: string
  member_id: string
  reason: string
  details: Record<string, unknown> | null
  member?: { member_identity?: { full_name: string } | null } | null
}

interface Props {
  diagnostics: DiagnosticItem[]
}

export function UnmatchedDiagnostics({ diagnostics }: Props) {
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
              <div key={d.id} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm">{name}</span>
                <span className="text-xs text-muted-foreground rounded-full bg-muted px-2 py-0.5">
                  {reason}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
