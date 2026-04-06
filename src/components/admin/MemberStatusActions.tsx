"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { updateMemberStatus } from "@/app/admin/members/[id]/interview/actions"
import { Button } from "@/components/ui/button"
import { Check, X, Ban } from "lucide-react"

interface Props {
  memberId: string
  currentStatus: string
}

const ACTIONS = [
  { status: "approved", label: "通过", icon: Check, variant: "default" as const },
  { status: "rejected", label: "拒绝", icon: X, variant: "outline" as const },
  { status: "inactive", label: "停用", icon: Ban, variant: "outline" as const },
] as const

export function MemberStatusActions({ memberId, currentStatus }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleAction(status: string) {
    if (!confirm(`确认将该成员状态改为「${ACTIONS.find(a => a.status === status)?.label}」？`)) return
    setLoading(status)
    setError(null)
    const result = await updateMemberStatus(memberId, status)
    setLoading(null)
    if (result.error) { setError(result.error); return }
    router.refresh()
  }

  // Filter out the current status from available actions
  const available = ACTIONS.filter(a => a.status !== currentStatus)

  return (
    <div className="flex items-center gap-2">
      {available.map(({ status, label, icon: Icon, variant }) => (
        <Button
          key={status}
          size="sm"
          variant={variant}
          onClick={() => handleAction(status)}
          disabled={loading !== null}
        >
          <Icon className="size-4 mr-1" />
          {loading === status ? "处理中..." : label}
        </Button>
      ))}
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  )
}
