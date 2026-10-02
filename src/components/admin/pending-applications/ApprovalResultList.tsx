"use client"

import { CheckCircle2, CircleAlert, UserRound } from "lucide-react"
import type { PendingApplicationItem as PendingApplication } from "@/types/pending-applications"
import type { ApprovalResult } from "./approval-results"

export function ApprovalResultList({ targets, results }: { targets: PendingApplication[]; results: ApprovalResult[] }) {
  const byId = new Map(results.map((result) => [result.id, result]))
  return (
    <ul aria-label="本次审核人员与结果" className="max-h-48 overflow-y-auto rounded-xl border border-border bg-muted/25 divide-y divide-border/60">
      {targets.map((item) => {
        const result = byId.get(item.id)
        const Icon = result?.success ? CheckCircle2 : result ? CircleAlert : UserRound
        return (
          <li key={item.id} className="flex items-start gap-3 px-3 py-2.5">
            <Icon className={`mt-0.5 size-4 shrink-0 ${result?.success ? "text-primary" : result ? "text-amber-700" : "text-muted-foreground"}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <span className="break-words text-sm font-medium">{item.fullName || "未填写姓名"}</span>
                {result ? <span className={`shrink-0 text-xs ${result.success ? "text-primary" : "text-amber-800"}`}>{result.success ? "已通过" : "未完成"}</span> : null}
              </div>
              {result && !result.success ? <p className="mt-1 text-xs leading-5 text-amber-900">{result.error || "处理失败，请重试"}</p> : null}
              {!result && item.schoolName ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.schoolName}</p> : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
