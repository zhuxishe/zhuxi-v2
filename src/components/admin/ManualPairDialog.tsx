"use client"

import { useRef, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { Loader2 } from "lucide-react"
import { checkPairCompatibility, checkGroupCompatibility, manualPair } from "@/app/admin/matching/[id]/manual-actions"
import { MemberSelect, MemberChips, CompatDisplay, GroupCompatDisplay } from "./ManualPairHelpers"
import type { CompatResult, GroupCompatResult } from "./ManualPairHelpers"
import { adminAuditReasonIsValid } from "@/lib/member-master/audit-reason"
import { adjustmentRequestStorage, clearMatchingAdjustmentRequestId, matchingAdjustmentRequestId } from "./matching-adjustment-request"

interface SelectableMember { id: string; name: string }

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  sessionId: string
  poolMembers: SelectableMember[]
  preselectedA?: string
  auditReason: string
  hasActiveMultiPool?: boolean
  onPaired: () => void
}

export function ManualPairDialog({
  open, onOpenChange, sessionId, poolMembers, preselectedA = "", auditReason, hasActiveMultiPool = false, onPaired,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>(preselectedA ? [preselectedA] : [])
  const [addValue, setAddValue] = useState("")
  const [pairCompat, setPairCompat] = useState<CompatResult | null>(null)
  const [groupCompat, setGroupCompat] = useState<GroupCompatResult | null>(null)
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()
  const [isChecking, startCheck] = useTransition()
  const checkGeneration = useRef(0)
  const submitting = useRef(false)

  const invalidateCheck = () => {
    checkGeneration.current += 1
    setPairCompat(null)
    setGroupCompat(null)
    setError("")
  }
  const reset = () => {
    invalidateCheck()
    setSelectedIds(preselectedA ? [preselectedA] : [])
    setAddValue("")
  }
  const handleAdd = (id: string) => {
    if (submitting.current || !id || selectedIds.includes(id)) return
    invalidateCheck()
    setSelectedIds([...selectedIds, id])
    setAddValue("")
  }
  const handleRemove = (id: string) => {
    if (submitting.current) return
    invalidateCheck()
    setSelectedIds(selectedIds.filter((x) => x !== id))
  }
  const canCheck = selectedIds.length >= 2
  const isGroup = selectedIds.length > 2

  const handleCheck = () => {
    if (!canCheck || submitting.current) return
    const generation = ++checkGeneration.current
    const ids = [...selectedIds]
    startCheck(async () => {
      setError("")
      setPairCompat(null)
      setGroupCompat(null)
      try {
        if (ids.length > 2) {
          const res = await checkGroupCompatibility(sessionId, ids)
          if (generation === checkGeneration.current) setGroupCompat(res)
        } else {
          const res = await checkPairCompatibility(sessionId, ids[0], ids[1])
          if (generation === checkGeneration.current) setPairCompat(res)
        }
      } catch {
        if (generation === checkGeneration.current) setError("兼容性检查失败，请重试")
      }
    })
  }

  const checked = pairCompat || groupCompat
  const compatible = checked?.compatible === true
  const blockedByMultiPool = isGroup && hasActiveMultiPool

  const handleConfirm = () => {
    if (!compatible || isChecking || submitting.current || blockedByMultiPool || !adminAuditReasonIsValid(auditReason)) return
    const ids = [...selectedIds]
    const storage = adjustmentRequestStorage()
    const operationId = matchingAdjustmentRequestId(sessionId, "manual", ids, storage, () => crypto.randomUUID())
    submitting.current = true
    startTransition(async () => {
      setError("")
      try {
        const res = await manualPair(sessionId, ids, auditReason, operationId, checked?.revisionToken)
        if (res.error) {
          setError(res.error)
        } else {
          clearMatchingAdjustmentRequestId(sessionId, "manual", ids, storage, operationId)
          reset()
          onPaired()
        }
      } catch {
        setError("配对结果待确认，请刷新操作记录或沿用同一编号重试")
      } finally {
        submitting.current = false
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (submitting.current) return; onOpenChange(v); if (!v) reset() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>手动配对</DialogTitle>
          <DialogDescription>选择至少 2 人进行手动配对（2人=双人对，3+人=多人池）。确认时会重新核验资格、占用和全部硬约束。</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {selectedIds.length > 0 && <div>
            <label className="text-xs font-medium text-muted-foreground">已选成员 ({selectedIds.length})</label>
            <div className="mt-1"><MemberChips ids={selectedIds} members={poolMembers} onRemove={handleRemove} disabled={isPending} /></div>
          </div>}
          <MemberSelect label="添加成员" value={addValue} onChange={handleAdd} members={poolMembers} exclude={selectedIds} disabled={isPending} />
          {hasActiveMultiPool && <p className="text-xs text-muted-foreground">本方案已有有效多人池；如需扩大，请先明确拆分原池，再选择完整成员重新检查。本次不会自动修改原池或新增第二池。</p>}
          {canCheck && <Button size="sm" variant="outline" className="w-full" onClick={handleCheck} disabled={isChecking || isPending}>
            {isChecking ? <Loader2 className="size-3.5 animate-spin" /> : null}检查兼容性
          </Button>}
          {pairCompat && <CompatDisplay compat={pairCompat} />}
          {groupCompat && <GroupCompatDisplay compat={groupCompat} />}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {checked && !compatible && <p className="text-xs text-red-600 text-center">资格或硬约束未通过，无法保存；请调整成员后重新检查。</p>}
          {blockedByMultiPool && <p className="text-xs text-amber-700 text-center">已有有效多人池，不能再新增第二池。</p>}
          <Button onClick={handleConfirm} disabled={!compatible || blockedByMultiPool || isChecking || isPending || !adminAuditReasonIsValid(auditReason)}>
            {isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}{isGroup ? `确认组建 (${selectedIds.length}人池)` : "确认配对"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
