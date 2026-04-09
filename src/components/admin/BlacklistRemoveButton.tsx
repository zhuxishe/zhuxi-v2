"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { removeBlacklist } from "@/app/admin/matching/blacklist/actions"

export function BlacklistRemoveButton({ relationId }: { relationId: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const router = useRouter()

  function handleClick() {
    if (!confirm) { setConfirm(true); return }
    setConfirm(false); setError(null)
    startTransition(async () => {
      const res = await removeBlacklist(relationId)
      if (res?.error) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        onClick={handleClick}
        disabled={isPending}
        className={`text-xs hover:underline disabled:opacity-50 ${confirm ? "text-red-600 font-medium" : "text-destructive"}`}
      >
        {isPending ? "删除中..." : confirm ? "确认删除？" : "删除"}
      </button>
      {confirm && (
        <button onClick={() => setConfirm(false)} className="text-xs text-muted-foreground hover:underline">
          取消
        </button>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </span>
  )
}
