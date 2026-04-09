"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { RefreshCw, Users, UserPlus } from "lucide-react"
import { runPoolRematch } from "@/app/admin/matching/[id]/pool-actions"
import { ManualPairDialog } from "./ManualPairDialog"
import { PlayerInfoPopover } from "./PlayerInfoPopover"
import type { PoolMember } from "@/lib/queries/pool-members"

export type { PoolMember }

interface Props {
  sessionId: string
  poolMembers: PoolMember[]
  onRefresh: () => void
}

export function RematchPool({ sessionId, poolMembers, onRefresh }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [showManual, setShowManual] = useState(false)

  if (poolMembers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">
        取消池为空 — 没有被拆散的配对
      </div>
    )
  }

  const handleRematch = () => {
    startTransition(async () => {
      setError("")
      setSuccess("")
      const res = await runPoolRematch(sessionId)
      if (res.error) {
        setError(res.error)
      } else {
        setSuccess(`成功生成 ${res.matchCount} 对新匹配`)
        router.refresh()
      }
    })
  }

  const handlePaired = () => {
    setShowManual(false)
    router.refresh()
  }

  // PoolMember → { id, name } for ManualPairDialog
  const dialogMembers = poolMembers.map((m) => ({ id: m.id, name: m.name }))

  return (
    <div className="rounded-lg border bg-orange-50/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Users className="size-4 text-orange-600" />
          再匹配池（{poolMembers.length} 人）
        </h3>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowManual(true)}
            disabled={poolMembers.length < 2}
          >
            <UserPlus className="size-3.5" /> 手动配对
          </Button>
          <Button
            size="sm"
            onClick={handleRematch}
            disabled={isPending || poolMembers.length < 2}
          >
            <RefreshCw className={`size-3.5 ${isPending ? "animate-spin" : ""}`} />
            运行再匹配
          </Button>
        </div>
      </div>

      {/* 成员列表 — 带信息弹窗 */}
      <div className="flex flex-wrap gap-1.5">
        {poolMembers.map((m) => (
          <span
            key={m.id}
            className="rounded-full bg-orange-100 text-orange-800 px-2.5 py-0.5 text-xs font-medium"
          >
            <PlayerInfoPopover member={m.memberData}>
              {m.name}
            </PlayerInfoPopover>
          </span>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}

      {/* 手动配对弹窗 */}
      <ManualPairDialog
        open={showManual}
        onOpenChange={setShowManual}
        sessionId={sessionId}
        poolMembers={dialogMembers}
        onPaired={handlePaired}
      />
    </div>
  )
}
