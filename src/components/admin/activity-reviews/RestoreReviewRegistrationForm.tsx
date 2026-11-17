"use client"

import { useState } from "react"
import type { RestoreReviewRegistrationAction } from "@/lib/activity-reviews/restore-registration-types"
import { adminAuditReasonIsValid } from "@/lib/member-master/audit-reason"
import { AuditReasonField, MutationFeedback, primaryButtonClass, useAdminReviewMutation } from "./shared"
import { useUnsavedActivityReviews } from "./use-unsaved-activity-reviews"

export function RestoreReviewRegistrationForm({ roundId, memberId, memberName, rosterDirty, restoreAction, onSaved }: {
  roundId: string
  memberId: string
  memberName: string
  rosterDirty: boolean
  restoreAction: RestoreReviewRegistrationAction
  onSaved?: () => void
}) {
  const [reason, setReason] = useState("")
  const mutation = useAdminReviewMutation()
  const canRefresh = useUnsavedActivityReviews(reason.length > 0 && !mutation.success)
  const disabled = rosterDirty || mutation.pending || mutation.success
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (disabled || !adminAuditReasonIsValid(reason) || !canRefresh()) return
    if (await mutation.run(() => restoreAction({ roundId, memberId, reason: reason.trim() }))) onSaved?.()
  }
  return <details className="rounded-lg border border-border p-3">
    <summary className="min-h-8 cursor-pointer text-sm font-medium">恢复 {memberName} 的误取消报名</summary>
    <form onSubmit={submit} className="mt-3 space-y-3">
      <p className="text-xs leading-5 text-muted-foreground">该成员仍在本场历史参与名单中，原有效评分保留。只有明确恢复报名后，才会重新检查其新增评价资格；普通保存名单不会恢复报名。</p>
      {rosterDirty ? <p role="status" className="text-xs text-amber-800">请先保存或撤回当前名单修改，再恢复报名。</p> : null}
      <AuditReasonField id={`restore-review-registration-${memberId}`} value={reason} onChange={setReason} disabled={disabled} label="恢复报名原因" />
      <button type="submit" disabled={disabled || !adminAuditReasonIsValid(reason)} className={primaryButtonClass}>{mutation.pending ? "恢复中…" : "确认恢复报名"}</button>
      <MutationFeedback error={mutation.error} success={mutation.success} />
    </form>
  </details>
}
