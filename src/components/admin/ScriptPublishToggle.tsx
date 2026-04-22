"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toggleScriptFeatured, toggleScriptPublish } from "@/app/admin/scripts/[id]/edit/actions"
import { Button } from "@/components/ui/button"

interface Props {
  scriptId: string
  isPublished: boolean
  isFeatured?: boolean
}

export function ScriptPublishToggle({ scriptId, isPublished, isFeatured }: Props) {
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

  function handleFeaturedToggle() {
    setError(null)
    startTransition(async () => {
      const result = await toggleScriptFeatured(scriptId, Boolean(isFeatured))
      if (result.error) {
        setError(result.error)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`text-xs font-medium px-2.5 py-1 rounded-full ${
          isPublished
            ? "bg-green-500/10 text-green-600"
            : "bg-orange-500/10 text-orange-500"
        }`}
      >
        {isPublished ? "已发布" : "草稿"}
      </span>
      {typeof isFeatured === "boolean" && (
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            isFeatured
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {isFeatured ? "精选活动" : "未精选"}
        </span>
      )}
      <Button
        variant="outline"
        size="xs"
        onClick={handleToggle}
        disabled={isPending}
      >
        {isPending ? "处理中..." : isPublished ? "取消发布" : "发布"}
      </Button>
      {typeof isFeatured === "boolean" && (
        <Button
          variant="outline"
          size="xs"
          onClick={handleFeaturedToggle}
          disabled={isPending}
        >
          {isPending ? "处理中..." : isFeatured ? "取消精选" : "设为精选"}
        </Button>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
