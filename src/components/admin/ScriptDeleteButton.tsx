"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { deleteScript } from "@/app/admin/scripts/[id]/edit/actions"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"

export function ScriptDeleteButton({ scriptId }: { scriptId: string }) {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteScript(scriptId)
      if (!result.error) {
        router.push("/admin/scripts")
      }
    })
  }

  if (!confirm) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive/60 hover:text-destructive hover:bg-destructive/10"
        onClick={() => setConfirm(true)}
      >
        <Trash2 className="h-3.5 w-3.5 mr-1" />
        删除
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isPending}>
        {isPending ? "删除中..." : "确认删除"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
        取消
      </Button>
    </div>
  )
}
