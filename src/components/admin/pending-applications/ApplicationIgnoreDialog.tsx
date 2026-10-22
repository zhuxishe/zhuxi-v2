"use client"

import { useRef, useState, type FormEvent } from "react"
import { EyeOff, LoaderCircle, RotateCcw } from "lucide-react"
import { ignorePendingApplication, restoreIgnoredApplication } from "@/app/admin/members/pending/actions"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { normalizeAdminAuditReason } from "@/lib/member-master/audit-reason"
import type { IgnoredApplicationItem, PendingApplicationItem } from "@/types/pending-applications"

type Props = {
  onClose: () => void
  onSuccess: () => void
} & (
  | { mode: "ignore"; target: PendingApplicationItem }
  | { mode: "restore"; target: IgnoredApplicationItem }
)

export function ApplicationIgnoreDialog(props: Props) {
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const submitting = useRef(false)
  const ignoring = props.mode === "ignore"
  const reasonId = `application-${props.mode}-reason`
  const reasonLength = Array.from(reason.trim()).length
  const reasonValid = normalizeAdminAuditReason(reason).ok

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting.current) return
    const validation = normalizeAdminAuditReason(reason)
    if (!validation.ok) { setError(validation.error); return }
    submitting.current = true
    setPending(true)
    setError(null)
    try {
      const response = props.mode === "ignore"
        ? await ignorePendingApplication(props.target.id, props.target.updatedAt, validation.reason)
        : await restoreIgnoredApplication(props.target.id, props.target.ignoredAt, validation.reason)
      if (response.error) { setError(response.error); return }
      if (!response.success) { setError("处理结果尚未确认，请刷新名单后核对。"); return }
      props.onSuccess()
    } catch {
      setError("网络异常，处理结果尚未确认。备注已保留，请重试或刷新名单核对。")
    } finally {
      submitting.current = false
      setPending(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !submitting.current) props.onClose() }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" showCloseButton={!pending}>
        <DialogHeader className="pr-7">
          <DialogTitle className="text-lg font-semibold">{ignoring ? "忽略申请" : "恢复待处理"}</DialogTitle>
          <DialogDescription>{ignoring
            ? "移入已忽略列表后，不再计入仪表盘的待处理申请提醒；需要继续跟进时，可填写说明恢复。"
            : "恢复后，此申请将重新显示在待处理名单中，并计入仪表盘提醒。"}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" aria-busy={pending}>
          <div className="rounded-xl border border-border bg-muted/30 px-3 py-3">
            <p className="text-sm font-medium">{props.target.fullName || "未填写姓名"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{props.target.schoolName || "未填写学校"}</p>
          </div>
          <div>
            <label htmlFor={reasonId} className="block text-sm font-medium">{ignoring ? "忽略备注" : "恢复说明"} <span className="text-destructive">*</span></label>
            <textarea
              id={reasonId} value={reason} onChange={(event) => { setReason(event.target.value); setError(null) }}
              required maxLength={1000} rows={3} disabled={pending} aria-describedby={`${reasonId}-help`}
              placeholder={ignoring ? "例如：非本社目标人群，暂不安排面试。" : "例如：已联系本人确认，重新安排面试。"}
              className="mt-2 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-6 outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
            />
            <div id={`${reasonId}-help`} className="mt-1 flex justify-between gap-3 text-xs leading-5 text-muted-foreground">
              <span>必填，4–500 个字符；自动记录当前操作人和操作时间。</span>
              <span className={`shrink-0 tabular-nums ${reasonLength > 500 ? "text-destructive" : ""}`}>{reasonLength}/500</span>
            </div>
          </div>
          {error ? <p role="alert" className="text-sm leading-6 text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-10" onClick={props.onClose} disabled={pending}>取消</Button>
            <Button type="submit" className="min-h-10" disabled={pending || !reasonValid}>
              {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : ignoring ? <EyeOff className="size-4" aria-hidden="true" /> : <RotateCcw className="size-4" aria-hidden="true" />}
              {pending ? "正在处理…" : ignoring ? "确认忽略" : "确认恢复"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
