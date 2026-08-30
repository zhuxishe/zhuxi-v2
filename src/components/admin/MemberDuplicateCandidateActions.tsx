"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { resolveMemberDuplicateCandidateAction } from "@/app/admin/members/[id]/actions"
import { Button } from "@/components/ui/button"
import { memberDisplayLabel } from "./member-center-utils"

export function MemberDuplicateCandidateActions({
  memberId,
  candidateId,
  status,
}: {
  memberId: string
  candidateId: number | string
  status: string | null
}) {
  const router = useRouter()
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (status !== "pending") {
    return <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">已处理：{status ? memberDisplayLabel(status) : "未知状态"}</p>
  }

  function resolve(resolution: "confirmed_duplicate" | "not_duplicate") {
    if (resolution === "confirmed_duplicate" && !window.confirm("这只会标记人工结论，不会自动合并两条成员记录。确认继续吗？")) return
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await resolveMemberDuplicateCandidateAction({ memberId, candidateId, resolution, reason })
      if (!result.success) {
        setError(result.error)
        return
      }
      setReason("")
      setMessage(result.message)
      router.refresh()
    })
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
      <p className="text-xs leading-5 text-amber-900">人工处置只改变候选状态并写入审计，不会自动合并、覆盖或删除成员。</p>
      <textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={500}
        rows={2}
        placeholder="处置原因（必填，至少 4 个字符）"
        className="mt-2 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400"
        disabled={pending}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => resolve("not_duplicate")} disabled={pending || reason.trim().length < 4}>标记非重复</Button>
        <Button type="button" variant="destructive" size="sm" onClick={() => resolve("confirmed_duplicate")} disabled={pending || reason.trim().length < 4}>确认重复（不合并）</Button>
      </div>
      {error ? <p role="alert" className="mt-2 text-xs text-destructive">{error}</p> : null}
      {message ? <p role="status" className="mt-2 text-xs text-emerald-800">{message}</p> : null}
    </div>
  )
}
