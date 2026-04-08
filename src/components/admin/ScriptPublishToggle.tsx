"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toggleScriptPublish } from "@/app/admin/scripts/[id]/edit/actions"
import { Button } from "@/components/ui/button"

interface Props {
  scriptId: string
  isPublished: boolean
}

export function ScriptPublishToggle({ scriptId, isPublished }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleToggle() {
    setError(null)
    startTransition(async () => {
      const result = await toggleScriptPublish(scriptId, isPublished)
      if (result.error) {
        setError(result.error)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className={`text-xs font-medium px-2.5 py-1 rounded-full ${
          isPublished
            ? "bg-green-500/10 text-green-600"
            : "bg-orange-500/10 text-orange-500"
        }`}
      >
        {isPublished ? "已发布" : "草稿"}
      </span>
      <Button
        variant="outline"
        size="xs"
        onClick={handleToggle}
        disabled={isPending}
      >
        {isPending ? "处理中..." : isPublished ? "取消发布" : "发布"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
