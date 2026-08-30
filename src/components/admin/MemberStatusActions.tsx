"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { updateMemberStatus } from "@/app/admin/members/[id]/interview/actions"
import { Button } from "@/components/ui/button"
import { Check, RotateCcw, X } from "lucide-react"

interface Props {
  memberId: string
  currentStatus: string
}

const ACTIONS = [
  { status: "pending", label: "恢复待审核", icon: RotateCcw, variant: "outline" as const },
  { status: "approved", label: "通过", icon: Check, variant: "default" as const },
  { status: "rejected", label: "拒绝", icon: X, variant: "outline" as const },
  { status: "inactive", label: "标记非活动", icon: X, variant: "outline" as const },
] as const

export function MemberStatusActions({ memberId, currentStatus }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState("")

  async function handleAction(status: string) {
    if (!confirm(`确认将该成员状态改为「${ACTIONS.find(a => a.status === status)?.label}」？`)) return
    setLoading(status)
    setError(null)
    const result = await updateMemberStatus(memberId, status, reason)
    setLoading(null)
    if (result.error) { setError(result.error); return }
    setReason("")
    router.refresh()
  }

  // Filter out the current status from available actions
  const available = ACTIONS.filter(a => a.status !== currentStatus)

  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="approval-actions-title">
      <h2 id="approval-actions-title" className="font-semibold">审批状态</h2>
      <p className="mt-1 text-xs text-muted-foreground">账号暂停属于生命周期操作，不在审批状态中处理；“非活动”只改变申请/业务状态，不影响登录。</p>
      <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-end">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">状态变更原因（必填）</span>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            placeholder="例如：面试复核通过"
            className="min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            disabled={loading !== null}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {available.map(({ status, label, icon: Icon, variant }) => (
            <Button key={status} size="sm" variant={variant} onClick={() => handleAction(status)} disabled={loading !== null || reason.trim().length < 4}>
              <Icon className="size-4" />
              {loading === status ? "处理中..." : label}
            </Button>
          ))}
        </div>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </section>
  )
}
