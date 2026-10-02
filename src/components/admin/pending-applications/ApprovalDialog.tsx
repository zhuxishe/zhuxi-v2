"use client"

import { useRef, useState, type FormEvent } from "react"
import { Check, LoaderCircle } from "lucide-react"
import { approvePendingApplications } from "@/app/admin/members/pending/actions"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { normalizeAdminAuditReason } from "@/lib/member-master/audit-reason"
import type { PendingApplicationItem as PendingApplication } from "@/types/pending-applications"
import { approvalRetryIds, mergeApprovalResults, type ApprovalResult } from "./approval-results"
import { ApprovalResultList } from "./ApprovalResultList"

interface Props {
  targets: PendingApplication[]
  onClose: () => void
  onResults: (results: ApprovalResult[]) => void
}

export function ApprovalDialog({ targets, onClose, onResults }: Props) {
  const [reason, setReason] = useState("")
  const [results, setResults] = useState<ApprovalResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const submitting = useRef(false)
  const retryIds = approvalRetryIds(targets.map((item) => item.id), results)
  const successCount = results.filter((result) => result.success).length
  const done = retryIds.length === 0
  const reasonValid = normalizeAdminAuditReason(reason).ok

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting.current || done) return
    const validation = normalizeAdminAuditReason(reason)
    if (!validation.ok) { setError(validation.error); return }
    submitting.current = true
    setPending(true)
    setError(null)
    try {
      const response = await approvePendingApplications(retryIds, validation.reason)
      if (response.error) { setError(response.error); return }
      const next = mergeApprovalResults(targets.map((item) => item.id), results, response.results ?? [])
      setResults(next)
      onResults(next)
    } catch {
      setError("网络异常，处理结果尚未确认。文字说明已保留，请重试核对。")
    } finally {
      submitting.current = false
      setPending(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !submitting.current) onClose() }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" showCloseButton={!pending}>
        <DialogHeader className="pr-7">
          <DialogTitle className="text-lg font-semibold">{done ? "审核已完成" : targets.length === 1 ? "确认通过申请" : `确认通过 ${targets.length} 位申请人`}</DialogTitle>
          <DialogDescription>请确认已完成资料核实。通过后，申请人即可使用正式成员功能。</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" aria-busy={pending}>
          <ApprovalResultList targets={targets} results={results} />
          {results.length > 0 ? (
            <p role="status" className="rounded-lg bg-bamboo-muted px-3 py-2 text-sm text-primary">
              已通过 {successCount} 人{done ? "。" : `，${retryIds.length} 人未完成；重试只处理未完成的申请。`}
            </p>
          ) : null}
          {!done ? (
            <div>
              <label htmlFor="pending-approval-reason" className="block text-sm font-medium">通过说明 <span className="text-destructive">*</span></label>
              <textarea
                id="pending-approval-reason" value={reason} onChange={(event) => { setReason(event.target.value); setError(null) }}
                required maxLength={1000} rows={3} disabled={pending} aria-describedby="pending-approval-reason-help"
                placeholder="例如：已完成面试，确认符合加入条件。"
                className="mt-2 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-6 outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
              />
              <div id="pending-approval-reason-help" className="mt-1 flex justify-between gap-3 text-xs leading-5 text-muted-foreground">
                <span>必填，4–500 个字符；将分别记入每位成员的审核记录。</span>
                <span className={`shrink-0 tabular-nums ${Array.from(reason.trim()).length > 500 ? "text-destructive" : ""}`}>{Array.from(reason.trim()).length}/500</span>
              </div>
            </div>
          ) : null}
          {error ? <p role="alert" className="text-sm leading-6 text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant={done ? "default" : "outline"} className="min-h-10" onClick={onClose} disabled={pending}>{done ? "完成" : results.length ? "关闭" : "取消"}</Button>
            {!done ? <Button type="submit" className="min-h-10" disabled={pending || !reasonValid}>
              {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
              {pending ? "正在处理…" : results.length ? `重试剩余 ${retryIds.length} 人` : `确认通过${targets.length > 1 ? ` ${targets.length} 人` : ""}`}
            </Button> : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
