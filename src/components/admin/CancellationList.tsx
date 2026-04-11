"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { approveCancellation, rejectCancellation } from "@/app/admin/matching/cancellations/actions"
import { Check, X, AlertTriangle } from "lucide-react"

interface CancellationRequest {
  id: string
  cancellation_reason: string | null
  cancellation_requested_by: string | null
  cancellation_requested_at: string | null
  session: unknown
  member_a: unknown
  member_b: unknown
  group_member_names?: string[] | null
}

interface Props {
  requests: CancellationRequest[]
}

export function CancellationList({ requests }: Props) {
  return (
    <div className="space-y-3">
      {requests.map((r) => (
        <CancellationItem key={r.id} request={r} />
      ))}
    </div>
  )
}

function CancellationItem({ request }: { request: CancellationRequest }) {
  const [loading, setLoading] = useState("")
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const isGroup = Array.isArray(request.group_member_names) && request.group_member_names.length > 0
  const memberLabel = isGroup
    ? request.group_member_names!.join("、")
    : `${getMemberName(request.member_a)} & ${getMemberName(request.member_b)}`

  const session = unwrap(request.session) as { session_name?: string } | undefined
  const requestedAt = request.cancellation_requested_at
    ? new Date(request.cancellation_requested_at).toLocaleString("zh-CN")
    : ""

  async function handleAction(action: "approve" | "reject") {
    setLoading(action); setError(null)
    const fn = action === "approve" ? approveCancellation : rejectCancellation
    const result = await fn(request.id)
    setLoading("")
    if (result.error) setError(result.error)
    else router.refresh()
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{memberLabel}</p>
          <p className="text-xs text-muted-foreground">{session?.session_name} · {requestedAt}</p>
        </div>
      </div>

      {isGroup && (
        <p className="text-xs text-orange-600 flex items-center gap-1">
          <AlertTriangle className="size-3.5" /> 同意后将解散整组（{request.group_member_names!.length}人）
        </p>
      )}

      {request.cancellation_reason && (
        <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
          {request.cancellation_reason}
        </p>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => handleAction("approve")}
          disabled={!!loading}
          className="inline-flex items-center gap-1 rounded-lg bg-green-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-600 disabled:opacity-50 transition-colors"
        >
          <Check className="size-3.5" />
          {loading === "approve" ? "处理中..." : "同意取消"}
        </button>
        <button
          onClick={() => handleAction("reject")}
          disabled={!!loading}
          className="inline-flex items-center gap-1 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
        >
          <X className="size-3.5" />
          {loading === "reject" ? "处理中..." : "驳回"}
        </button>
      </div>
    </div>
  )
}

function unwrap(v: unknown) {
  return (Array.isArray(v) ? v[0] : v) as Record<string, unknown> | undefined
}

function getMemberName(member: unknown): string {
  const m = unwrap(member)
  if (!m) return "未知"
  const identity = unwrap(m.member_identity)
  return String(identity?.full_name ?? identity?.nickname ?? "未知")
}
