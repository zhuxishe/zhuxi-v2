"use client"

import { useTransition } from "react"
import { removeBlacklist } from "@/app/admin/matching/blacklist/actions"

export function BlacklistRemoveButton({ relationId }: { relationId: string }) {
  const [isPending, startTransition] = useTransition()

  function handleRemove() {
    if (!confirm("确定要移除这条黑名单记录吗？")) return
    startTransition(async () => {
      const res = await removeBlacklist(relationId)
      if (res?.error) alert(res.error)
    })
  }

  return (
    <button
      onClick={handleRemove}
      disabled={isPending}
      className="text-xs text-destructive hover:underline disabled:opacity-50"
    >
      {isPending ? "删除中..." : "删除"}
    </button>
  )
}
