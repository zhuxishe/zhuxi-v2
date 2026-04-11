"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { Loader2 } from "lucide-react"
import { checkPairCompatibility, checkGroupCompatibility, manualPair } from "@/app/admin/matching/[id]/manual-actions"
import { MemberSelect, MemberChips, CompatDisplay, GroupCompatDisplay } from "./ManualPairHelpers"
import type { CompatResult, GroupCompatResult } from "./ManualPairHelpers"

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
  const [selectedIds, setSelectedIds] = useState<string[]>(preselectedA ? [preselectedA] : [])
  const [addValue, setAddValue] = useState("")
  const [pairCompat, setPairCompat] = useState<CompatResult | null>(null)
  const [groupCompat, setGroupCompat] = useState<GroupCompatResult | null>(null)
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()
  const [isChecking, startCheck] = useTransition()

  const reset = () => {
    setSelectedIds(preselectedA ? [preselectedA] : [])
    setAddValue("")
    setPairCompat(null)
    setGroupCompat(null)
    setError("")
  }

  const handleAdd = (id: string) => {
    if (!id || selectedIds.includes(id)) return
    if (selectedIds.length >= 6) return
    setSelectedIds([...selectedIds, id])
    setAddValue("")
    setPairCompat(null)
    setGroupCompat(null)
  }

  const handleRemove = (id: string) => {
    setSelectedIds(selectedIds.filter((x) => x !== id))
    setPairCompat(null)
    setGroupCompat(null)
  }

  const canCheck = selectedIds.length >= 2
  const isGroup = selectedIds.length > 2

  const handleCheck = () => {
    if (!canCheck) return
    startCheck(async () => {
      setError("")
      setPairCompat(null)
      setGroupCompat(null)
      try {
        if (isGroup) {
          const res = await checkGroupCompatibility(sessionId, selectedIds)
          setGroupCompat(res)
        } else {
          const res = await checkPairCompatibility(sessionId, selectedIds[0], selectedIds[1])
          setPairCompat(res)
        }
      } catch {
        setError("兼容性检查失败")
      }
    })
  }

  const checked = pairCompat || groupCompat
  const compatible = pairCompat?.compatible ?? groupCompat?.compatible ?? false

  // 时段是唯一不可覆盖的约束——没有公共时段就物理上无法见面
  const hasTimeSlot = pairCompat?.bestSlot != null || groupCompat?.bestSlot != null
  const canForce = checked && !compatible && hasTimeSlot

  const handleConfirm = () => {
    startTransition(async () => {
      setError("")
      const res = await manualPair(sessionId, selectedIds)
      if (res.error) {
        setError(res.error)
      } else {
        reset()
        onPaired()
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>手动配对</DialogTitle>
          <DialogDescription>
            选择 2-6 人进行手动配对（2人=双人对，3+人=多人组）
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* 已选成员 chips */}
          {selectedIds.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                已选成员 ({selectedIds.length}/6)
              </label>
              <div className="mt-1">
                <MemberChips ids={selectedIds} members={poolMembers} onRemove={handleRemove} />
              </div>
            </div>
          )}

          {/* 添加成员下拉 */}
          {selectedIds.length < 6 && (
            <MemberSelect
              label="添加成员"
              value={addValue}
              onChange={handleAdd}
              members={poolMembers}
              exclude={selectedIds}
            />
          )}

          {/* 检查兼容性按钮 */}
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

          {/* 兼容性结果 */}
          {pairCompat && <CompatDisplay compat={pairCompat} />}
          {groupCompat && <GroupCompatDisplay compat={groupCompat} />}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {checked && !compatible && !hasTimeSlot && (
            <p className="text-xs text-red-600 text-center">无共同时段，无法配对</p>
          )}
          {canForce && (
            <p className="text-xs text-amber-600 text-center">硬约束未完全通过，但有共同时段 — 可强制配对</p>
          )}
          <Button
            onClick={handleConfirm}
            disabled={!checked || (!compatible && !canForce) || isPending}
            variant={canForce ? "outline" : "default"}
          >
            {isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {canForce
              ? (isGroup ? `强制组建 (${selectedIds.length}人组)` : "强制配对")
              : (isGroup ? `确认组建 (${selectedIds.length}人组)` : "确认配对")
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
