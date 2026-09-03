"use client"

import { useRef, useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { adminAuditReasonIsValid } from "@/lib/member-master/audit-reason"
import { createPastEventReview } from "./actions"
import { LargeActivityFields, reviewInputFromFormData } from "./LargeActivityFields"

const REVIEW_CREATION_REQUEST_KEY = "zhuxishe:admin:new-review-request-id"

export function ReviewForm() {
  const creationRequestId = useRef<string | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [auditReason, setAuditReason] = useState("")

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const form = e.currentTarget
    const fd = new FormData(form)
    creationRequestId.current ??= persistedCreationRequestId()
    try {
      const result = await createPastEventReview({
        ...reviewInputFromFormData(fd),
        request_id: creationRequestId.current,
      }, auditReason)
      setLoading(false)
      if (result.error) {
        if (result.error.includes("请求编号")) clearCreationRequestId()
        return setError(result.error)
      }
      setOpen(false)
      setAuditReason("")
      clearCreationRequestId()
      form.reset()
    } catch (caught) {
      console.error("[ReviewForm]", caught)
      setLoading(false)
      setError("网络响应中断。请不要刷新页面，直接再次点击保存；系统会使用同一请求编号避免重复新建。")
    }
  }

  function persistedCreationRequestId() {
    const next = crypto.randomUUID()
    try {
      const existing = sessionStorage.getItem(REVIEW_CREATION_REQUEST_KEY)
      if (existing) return existing
      sessionStorage.setItem(REVIEW_CREATION_REQUEST_KEY, next)
    } catch {
      // The in-memory request id remains effective when browser storage is disabled.
    }
    return next
  }

  function clearCreationRequestId() {
    try { sessionStorage.removeItem(REVIEW_CREATION_REQUEST_KEY) } catch { /* storage unavailable */ }
    creationRequestId.current = null
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus className="size-4 mr-1" /> 添加大型活动
      </Button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-5">
      <LargeActivityFields />
      <label className="grid gap-1 text-xs font-medium">
        <span>本次创建理由 *</span>
        <input
          value={auditReason}
          onChange={(event) => setAuditReason(event.target.value)}
          minLength={4}
          maxLength={500}
          required
          placeholder="必填，4–500 字；将写入后台审计"
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={loading || !adminAuditReasonIsValid(auditReason)}>{loading ? "保存中..." : "保存"}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>取消</Button>
      </div>
    </form>
  )
}
