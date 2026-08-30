"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { removeBlacklist } from "@/app/admin/matching/blacklist/actions"
import { adminAuditReasonIsValid } from "@/lib/member-master/audit-reason"

export function BlacklistRemoveButton({ relationId }: { relationId: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [reason, setReason] = useState("")
  const router = useRouter()

  function handleClick() {
    if (!confirm) { setConfirm(true); return }
    if (!adminAuditReasonIsValid(reason)) {
      setError("请填写 4–500 个字符的删除理由")
      return
    }
    setConfirm(false); setError(null)
    startTransition(async () => {
      const res = await removeBlacklist(relationId, reason)
      if (res?.error) setError(res.error)
      else {
        setReason("")
        router.refresh()
      }
    })
  }

  return (
    <div className="inline-flex max-w-64 flex-col items-end gap-1">
      {confirm && (
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          minLength={4}
          maxLength={500}
          placeholder="删除理由（必填）"
          className="w-56 rounded-md border bg-background px-2 py-1 text-xs"
        />
      )}
      <button
        onClick={handleClick}
        disabled={isPending || (confirm && !adminAuditReasonIsValid(reason))}
        className={`text-xs hover:underline disabled:opacity-50 ${confirm ? "text-red-600 font-medium" : "text-destructive"}`}
      >
        {isPending ? "删除中..." : confirm ? "确认删除？" : "删除"}
      </button>
      {confirm && (
        <button onClick={() => { setConfirm(false); setReason(""); setError(null) }} className="text-xs text-muted-foreground hover:underline">
          取消
        </button>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
