"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { Loader2 } from "lucide-react"
import { checkPairCompatibility, manualPair } from "@/app/admin/matching/[id]/manual-actions"
import { MemberSelect, CompatDisplay } from "./ManualPairHelpers"
import type { CompatResult } from "./ManualPairHelpers"

interface SelectableMember { id: string; name: string }

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  sessionId: string
  poolMembers: SelectableMember[]
  preselectedA?: string
  onPaired: () => void
}

export function ManualPairDialog({
  open, onOpenChange, sessionId, poolMembers, preselectedA = "", onPaired,
}: Props) {
  const [memberA, setMemberA] = useState(preselectedA)
  const [memberB, setMemberB] = useState("")
  const [compat, setCompat] = useState<CompatResult | null>(null)
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()
  const [isChecking, startCheck] = useTransition()

  const reset = () => {
    setMemberA(preselectedA)
    setMemberB("")
    setCompat(null)
    setError("")
  }

  const handleCheck = () => {
    if (!memberA || !memberB || memberA === memberB) return
    startCheck(async () => {
      setError("")
      setCompat(null)
      try {
        const res = await checkPairCompatibility(sessionId, memberA, memberB)
        setCompat(res)
      } catch {
        setError("兼容性检查失败")
      }
    })
  }

  const handleConfirm = () => {
    startTransition(async () => {
      setError("")
      const res = await manualPair(sessionId, memberA, memberB)
      if (res.error) {
        setError(res.error)
      } else {
        reset()
        onPaired()
      }
    })
  }

  const canCheck = memberA && memberB && memberA !== memberB
  const nameA = poolMembers.find((m) => m.id === memberA)?.name
  const nameB = poolMembers.find((m) => m.id === memberB)?.name

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>手动配对</DialogTitle>
          <DialogDescription>
            从取消池中选择两人进行手动配对
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <MemberSelect
            label="成员 A"
            value={memberA}
            onChange={(v) => { setMemberA(v); setCompat(null) }}
            members={poolMembers}
            exclude={memberB}
          />
          <MemberSelect
            label="成员 B"
            value={memberB}
            onChange={(v) => { setMemberB(v); setCompat(null) }}
            members={poolMembers}
            exclude={memberA}
          />

          {canCheck && (
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={handleCheck}
              disabled={isChecking}
            >
              {isChecking ? <Loader2 className="size-3.5 animate-spin" /> : null}
              检查兼容性
            </Button>
          )}

          {compat && (
            <CompatDisplay compat={compat} nameA={nameA} nameB={nameB} />
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            onClick={handleConfirm}
            disabled={!canCheck || isPending}
          >
            {isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            确认配对
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
