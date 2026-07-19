"use client"

import { useActionState } from "react"
import { updatePlayerFeedbackAction } from "@/app/admin/feedback/actions"
import { ADMIN_FEEDBACK_INITIAL_STATE } from "@/lib/player-feedback/constants"
import type { PlayerFeedbackStatus } from "@/types/player-feedback"

export function PlayerFeedbackStatusForm({
  feedbackId,
  status,
  adminNote,
  updatedAt,
}: {
  feedbackId: string
  status: PlayerFeedbackStatus
  adminNote: string | null
  updatedAt: string
}) {
  const [state, action, pending] = useActionState(
    updatePlayerFeedbackAction,
    ADMIN_FEEDBACK_INITIAL_STATE,
  )

  return (
    <form action={action} className="space-y-3 border-t border-border pt-4">
      <input type="hidden" name="feedbackId" value={feedbackId} />
      <input type="hidden" name="expectedUpdatedAt" value={updatedAt} />
      <div className="grid gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">处理状态</span>
          <select
            name="status"
            defaultValue={status}
            disabled={pending}
            className="min-h-10 w-full rounded-lg border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="pending">待处理</option>
            <option value="in_progress">处理中</option>
            <option value="completed">已完成</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">管理员备注</span>
          <textarea
            name="adminNote"
            defaultValue={adminNote ?? ""}
            disabled={pending}
            maxLength={2000}
            rows={2}
            placeholder="记录处理结果或后续安排"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="min-h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? "保存中…" : "保存处理"}
        </button>
      </div>
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p role="status" className="text-sm text-emerald-700">处理结果已保存</p>}
    </form>
  )
}
