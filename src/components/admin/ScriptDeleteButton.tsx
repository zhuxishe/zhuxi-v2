"use client"

import { Archive, RotateCcw, Trash2 } from "lucide-react"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  archiveScript,
  permanentlyDeleteScript,
  restoreScript,
} from "@/app/admin/scripts/[id]/edit/actions"
import { Button } from "@/components/ui/button"
import { adminAuditReasonIsValid } from "@/lib/member-master/audit-reason"

interface Props {
  scriptId: string
  isArchived: boolean
  isSuperAdmin: boolean
  updatedAt: string
}

export function ScriptDeleteButton({ scriptId, isArchived, isSuperAdmin, updatedAt }: Props) {
  const router = useRouter()
  const [mode, setMode] = useState<"idle" | "archive" | "restore" | "permanent">("idle")
  const [reason, setReason] = useState("")
  const [confirmText, setConfirmText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function cancel() {
    setMode("idle")
    setReason("")
    setConfirmText("")
    setError(null)
    setWarning(null)
  }

  function run() {
    setError(null)
    setWarning(null)
    startTransition(async () => {
      const result = mode === "archive"
        ? await archiveScript(scriptId, reason, updatedAt)
        : mode === "restore"
          ? await restoreScript(scriptId, reason, updatedAt)
          : await permanentlyDeleteScript(scriptId, reason, updatedAt)
      if (result.error) { setError(result.error); return }
      if ("warning" in result && typeof result.warning === "string") setWarning(result.warning)
      if (mode === "permanent") {
        router.push("/admin/scripts?view=archived")
      } else if (mode === "archive") {
        router.push("/admin/scripts")
      } else {
        router.push(`/admin/scripts/${scriptId}`)
      }
      router.refresh()
    })
  }

  if (mode !== "idle") {
    const permanent = mode === "permanent"
    return (
      <div className="w-full space-y-2 rounded-lg border border-border bg-background p-3">
        <p className="text-xs font-medium">
          {mode === "archive" ? "移入回收站后，两端都会立即隐藏。" : mode === "restore" ? "恢复后仍保持两端隐藏，请手动重新开启。" : "永久删除不可恢复，并会清理关联文件。"}
        </p>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          minLength={4}
          maxLength={500}
          rows={2}
          placeholder="操作理由（必填，4–500 字）"
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"
        />
        {permanent && (
          <input
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder="再次确认：输入 永久删除"
            className="h-8 w-full rounded-md border border-destructive/40 bg-background px-2 text-xs outline-none"
          />
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={permanent ? "destructive" : "default"}
            size="sm"
            onClick={run}
            disabled={pending || !adminAuditReasonIsValid(reason) || (permanent && confirmText !== "永久删除")}
          >
            {pending ? "处理中..." : permanent ? "确认永久删除" : mode === "restore" ? "确认恢复" : "确认归档"}
          </Button>
          <Button variant="ghost" size="sm" onClick={cancel} disabled={pending}>取消</Button>
        </div>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        {warning && <p role="status" className="text-xs text-amber-700">{warning}</p>}
      </div>
    )
  }

  if (!isArchived) {
    return (
      <Button variant="ghost" size="sm" className="text-destructive/70 hover:bg-destructive/10 hover:text-destructive" onClick={() => setMode("archive")}>
        <Archive className="mr-1 size-3.5" />移入回收站
      </Button>
    )
  }

  if (!isSuperAdmin) return <p className="text-xs text-muted-foreground">仅超级管理员可以恢复或永久删除</p>
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={() => setMode("restore")}><RotateCcw className="mr-1 size-3.5" />恢复</Button>
      <Button variant="destructive" size="sm" onClick={() => setMode("permanent")}><Trash2 className="mr-1 size-3.5" />永久删除</Button>
    </div>
  )
}
