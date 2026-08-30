"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { updateVerification } from "@/app/admin/members/[id]/verify/actions"
import { Button } from "@/components/ui/button"
import { CheckCircle, Circle } from "lucide-react"

import type { MemberVerificationRow } from "@/types/member-detail"

interface Props {
  memberId: string
  existing: Partial<MemberVerificationRow> | null
}

export function VerificationPanel({ memberId, existing }: Props) {
  const router = useRouter()
  const [studentId, setStudentId] = useState(existing?.student_id_verified ?? false)
  const [photo, setPhoto] = useState(existing?.photo_verified ?? false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState("")
  const hasChanges = studentId !== (existing?.student_id_verified ?? false)
    || photo !== (existing?.photo_verified ?? false)

  async function handleSave() {
    setSubmitting(true)
    setError(null)
    const result = await updateVerification(memberId, {
      student_id_verified: studentId,
      photo_verified: photo,
    }, reason)
    setSubmitting(false)
    if (result.error) setError(result.error)
    else {
      setReason("")
      router.refresh()
    }
  }

  return (
    <div className="max-w-sm space-y-4">
      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-3">
        <h3 className="text-sm font-semibold">核验项目</h3>

        <button type="button" onClick={() => setStudentId(!studentId)}
          className="flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors">
          {studentId ? <CheckCircle className="size-5 text-green-500" /> : <Circle className="size-5 text-muted-foreground" />}
          <span className="text-sm font-medium">学生证验证</span>
        </button>

        <button type="button" onClick={() => setPhoto(!photo)}
          className="flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors">
          {photo ? <CheckCircle className="size-5 text-green-500" /> : <Circle className="size-5 text-muted-foreground" />}
          <span className="text-sm font-medium">照片验证</span>
        </button>

        {existing?.verified_at && (
          <p className="text-xs text-muted-foreground">
            核验完成于 {new Date(existing.verified_at).toLocaleString("zh-CN")}
          </p>
        )}
      </div>

      <label className="block rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <span className="text-sm font-semibold">核验变更原因（必填）</span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          rows={3}
          placeholder="例如：现场核对学生证原件"
          className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          disabled={submitting}
        />
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={handleSave} disabled={submitting || reason.trim().length < 4 || !hasChanges}>
        {submitting ? "保存中..." : "保存核验状态"}
      </Button>
    </div>
  )
}
