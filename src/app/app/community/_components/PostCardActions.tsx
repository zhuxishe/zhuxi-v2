"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { Heart, MessageCircle } from "lucide-react"
import { toggleCommunityLikeAction } from "@/app/app/community/actions"

interface PostCardActionsProps {
  postId: string
  detailHref: string
  initialLiked: boolean
  initialLikeCount: number
  commentCount: number
  canWrite: boolean
  locale: "zh" | "ja"
}

export function PostCardActions({
  postId,
  detailHref,
  initialLiked,
  initialLikeCount,
  commentCount,
  canWrite,
  locale,
}: PostCardActionsProps) {
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialLikeCount)
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  function toggle() {
    if (!canWrite || pending) return
    const previous = { liked, count }
    setLiked(!liked)
    setCount((value) => Math.max(0, value + (liked ? -1 : 1)))
    startTransition(async () => {
      const result = await toggleCommunityLikeAction(postId)
      if (!result.success) {
        setLiked(previous.liked)
        setCount(previous.count)
        setError(result.error || (locale === "ja" ? "操作に失敗しました" : "操作失败"))
      } else {
        setLiked(Boolean(result.liked))
        setCount(result.likeCount ?? previous.count)
        setError("")
      }
    })
  }

  return (
    <div>
      <div className="flex min-h-11 items-center gap-5 text-sm">
        <button
          type="button"
          disabled={!canWrite || pending}
          onClick={toggle}
          aria-pressed={liked}
          aria-label={locale === "ja" ? "いいね" : "点赞"}
          className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 disabled:opacity-45 ${liked ? "font-semibold text-primary" : "text-muted-foreground"}`}
        >
          <Heart className="size-[18px]" fill={liked ? "currentColor" : "none"} />
          <span>{count}</span>
        </button>
        <Link href={detailHref} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-muted-foreground">
          <MessageCircle className="size-[18px]" />
          <span>{commentCount}</span>
          <span className="sr-only">{locale === "ja" ? "コメント" : "评论"}</span>
        </Link>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
