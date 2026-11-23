"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useUnsavedActivityReviews } from "@/components/admin/activity-reviews/use-unsaved-activity-reviews"
import { validateResolvePeerNoMatchRequest } from "@/lib/peer-no-match/admin-validation"
import type { AdminPeerNoMatchRequest, ResolvePeerNoMatchRequestAction } from "@/lib/peer-no-match/admin-types"

const INPUT_CLASS = "min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50"

export function NoMatchResolutionForm({ request, action }: { request: AdminPeerNoMatchRequest; action: ResolvePeerNoMatchRequestAction }) {
  const router = useRouter()
  const [status, setStatus] = useState<"resolved" | "closed">("resolved")
  const [internalNote, setInternalNote] = useState("")
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()
  const canRefresh = useUnsavedActivityReviews((status !== "resolved" || internalNote.length > 0 || reason.length > 0) && !saved)
  if (request.status !== "pending") return null
  const payload = { requestId: request.id, status, expectedVersion: request.version, internalNote, reason }
  const invalid = validateResolvePeerNoMatchRequest(payload)
  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (pending || saved || invalid || !canRefresh()) return
    setError(null)
    startTransition(async () => {
      try {
        const result = await action(payload)
        if ("error" in result) { setError(result.error); return }
        setSaved(true)
        router.refresh()
      } catch { setError("处理记录未能保存，请检查网络后重试。当前输入已保留。") }
    })
  }
  return <form onSubmit={submit} className="space-y-3 border-t border-border pt-4">
    <h3 className="text-sm font-semibold">记录人工处理结果</h3>
    <p className="text-xs leading-5 text-muted-foreground">请记录已采取的安排或关闭原因。保存只更新申请状态，不会自动禁配或修改已发布的匹配；不会向双方发送自动通知。</p>
    <fieldset disabled={pending || saved} className="space-y-3">
      <label className="block text-sm"><span className="mb-1.5 block font-medium">处理结果</span><select value={status} onChange={(event) => setStatus(event.target.value as "resolved" | "closed")} className={INPUT_CLASS}><option value="resolved">已处理</option><option value="closed">已关闭</option></select></label>
      <label className="block text-sm"><span className="mb-1.5 block font-medium">内部处理说明</span><textarea value={internalNote} onChange={(event) => setInternalNote(event.target.value)} rows={3} maxLength={4000} required className={INPUT_CLASS} placeholder="记录实际安排或核查情况，4–2000 字" /><span className="mt-1 block text-xs text-muted-foreground">仅工作人员可见，不向申请人或对方展示。</span></label>
      <label className="block text-sm"><span className="mb-1.5 block font-medium">操作理由</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={1000} required className={INPUT_CLASS} placeholder="说明本次记录为已处理或关闭的理由，4–500 字" /></label>
      <button type="submit" disabled={Boolean(invalid)} className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">{pending ? "保存中…" : "保存处理结果"}</button>
    </fieldset>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {saved ? <p role="status" className="text-sm text-emerald-700">处理记录已保存；匹配安排需由工作人员另行落实。</p> : null}
  </form>
}
