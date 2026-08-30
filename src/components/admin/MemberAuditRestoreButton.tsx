"use client"

import { useState, useTransition } from "react"
import { RotateCcw } from "lucide-react"
import { useRouter } from "next/navigation"
import { restoreMemberAuditAction } from "@/app/admin/members/[id]/actions"
import { Button } from "@/components/ui/button"

export function MemberAuditRestoreButton({
  memberId,
  eventId,
}: {
  memberId: string
  eventId: number | string
}) {
  const router = useRouter()
  const [reason, setReason] = useState("")
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function restore() {
    if (!window.confirm("确认以该审计事件的历史值恢复对应分区吗？恢复本身也会写入新的审计事件。")) return
    setError(null)
    startTransition(async () => {
      const result = await restoreMemberAuditAction({ memberId, eventId, reason })
      if (!result.success) {
        setError(result.error)
        return
      }
      setEditing(false)
      setReason("")
      router.refresh()
    })
  }

  if (!editing) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
        <RotateCcw className="size-4" aria-hidden="true" />
        恢复此事件
      </Button>
    )
  }

  return (
    <div className="w-full rounded-lg border border-amber-200 bg-amber-50 p-3">
      <label className="block text-xs font-medium text-amber-900">
        恢复原因（必填）
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          rows={2}
          placeholder="说明为什么要恢复该历史值"
          className="mt-1 w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-amber-400"
          disabled={pending}
        />
      </label>
      {error ? <p role="alert" className="mt-2 text-xs text-destructive">{error}</p> : null}
      <div className="mt-2 flex gap-2">
        <Button type="button" size="sm" onClick={restore} disabled={pending || reason.trim().length < 4}>
          {pending ? "恢复中" : "确认恢复"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)} disabled={pending}>取消</Button>
      </div>
    </div>
  )
}
