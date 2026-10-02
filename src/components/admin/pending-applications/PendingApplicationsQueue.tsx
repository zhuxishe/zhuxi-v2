"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, ClipboardCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { PendingApplicationItem as PendingApplication } from "@/types/pending-applications"
import { ApprovalDialog } from "./ApprovalDialog"
import { ApprovalResultList } from "./ApprovalResultList"
import { ApprovalSelectionCheckbox } from "./ApprovalSelectionCheckbox"
import { PendingApplicationRow } from "./PendingApplicationRow"
import type { ApprovalResult } from "./approval-results"

export function PendingApplicationsQueue({ items }: { items: PendingApplication[] }) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [completedIds, setCompletedIds] = useState<string[]>([])
  const [targets, setTargets] = useState<PendingApplication[] | null>(null)
  const [report, setReport] = useState<{ targets: PendingApplication[]; results: ApprovalResult[] } | null>(null)
  const visible = items.filter((item) => !completedIds.includes(item.id))
  const eligible = visible.filter((item) => !item.blockReason)
  const selected = eligible.filter((item) => selectedIds.includes(item.id))
  const allSelected = eligible.length > 0 && selected.length === eligible.length

  function toggle(id: string) {
    setSelectedIds((previous) => previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id])
  }

  function receiveResults(results: ApprovalResult[]) {
    const succeeded = new Set(results.filter((result) => result.success).map((result) => result.id))
    setCompletedIds((previous) => [...new Set([...previous, ...succeeded])])
    setSelectedIds((previous) => previous.filter((id) => !succeeded.has(id)))
    setReport({ targets: targets ?? [], results })
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {report ? <div className="rounded-xl border border-primary/15 bg-bamboo-muted/50 px-4 py-3">
        <p role="status" className="text-sm font-medium text-primary">
          本次已通过 {report.results.filter((result) => result.success).length} 人
          {report.results.some((result) => !result.success) ? `，${report.results.filter((result) => !result.success).length} 人未完成。` : "，名单已更新。"}
        </p>
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer rounded py-1 focus-visible:outline-2 focus-visible:outline-primary">查看处理明细</summary>
          <div className="mt-2"><ApprovalResultList targets={report.targets} results={report.results} /></div>
        </details>
      </div> : null}
      <section aria-label="待处理申请名单" className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className={`flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-3 sm:px-5 ${selected.length ? "bg-bamboo-muted" : "bg-muted/20"}`}>
          <div className="flex items-center gap-2">
            <ApprovalSelectionCheckbox label={`全选本页可通过的 ${eligible.length} 人`} checked={allSelected} mixed={selected.length > 0 && !allSelected} disabled={!eligible.length} onChange={() => setSelectedIds(allSelected ? [] : eligible.map((item) => item.id))} />
            <div>
              <p className="text-sm font-medium">{selected.length ? `已选择 ${selected.length} 人` : "选择本页申请"}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">仅选择本页可通过人员；搜索或翻页后清空。</p>
            </div>
          </div>
          <div className="ml-auto flex gap-2">
            {selected.length > 0 ? <Button type="button" variant="ghost" className="min-h-10" onClick={() => setSelectedIds([])}>清空</Button> : null}
            <Button type="button" className="min-h-10" disabled={!selected.length} onClick={() => setTargets(selected)}><Check className="size-4" aria-hidden="true" />通过所选{selected.length ? ` (${selected.length})` : ""}</Button>
          </div>
        </div>
        {visible.length ? <>
          <div aria-hidden="true" className="hidden grid-cols-[2.5rem_minmax(0,1.3fr)_minmax(0,1fr)_10rem_12rem] gap-x-4 border-b border-border/60 px-5 py-2.5 text-xs text-muted-foreground lg:grid">
            <span /><span>申请人</span><span>学校</span><span>提交时间（日本时间）</span><span className="text-right">审核操作</span>
          </div>
          <ul>
            {visible.map((item) => <PendingApplicationRow key={item.id} item={item} selected={selected.some((value) => value.id === item.id)} onSelect={() => toggle(item.id)} onApprove={() => setTargets([item])} />)}
          </ul>
        </> : <div className="flex flex-col items-center px-6 py-14 text-center">
          <span className="mb-4 rounded-full bg-bamboo-muted p-3 text-primary"><ClipboardCheck className="size-6" aria-hidden="true" /></span>
          <p className="font-medium">本页暂无待处理申请</p>
          <p className="mt-2 text-sm text-muted-foreground">新的申请提交后会显示在这里；也可以调整搜索条件。</p>
        </div>}
      </section>
      {targets ? <ApprovalDialog targets={targets} onClose={() => setTargets(null)} onResults={receiveResults} /> : null}
    </div>
  )
}
