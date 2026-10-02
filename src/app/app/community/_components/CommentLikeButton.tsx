"use client"

import { useId, useReducer, useRef } from "react"
import { Heart } from "lucide-react"
import { setCommunityCommentLikeAction } from "@/app/app/community/actions"
import { commentLikeReducer, createCommentLikeState } from "@/lib/community/comment-like-state"

interface CommentLikeButtonProps {
  commentId: string
  postId: string
  likeCount: number
  likeVersion: number
  likedByMe: boolean
  canWrite: boolean
  locale: "zh" | "ja"
}

export function CommentLikeButton({ commentId, postId, likeCount, likeVersion, likedByMe, canWrite, locale }: CommentLikeButtonProps) {
  const [state, dispatch] = useReducer(commentLikeReducer, { liked: likedByMe, count: likeCount, version: likeVersion }, createCommentLikeState)
  const inFlight = useRef(false)
  const errorId = useId()
  if (state.source.liked !== likedByMe || state.source.count !== likeCount || state.source.version !== likeVersion) {
    dispatch({ type: "sync", snapshot: { liked: likedByMe, count: likeCount, version: likeVersion } })
  }

  async function setLiked() {
    if (!canWrite || inFlight.current) return
    inFlight.current = true
    const nextLiked = !state.liked
    const fallback = locale === "ja" ? "いいねの更新に失敗しました。もう一度お試しください。" : "点赞操作失败，请重试"
    dispatch({ type: "start" })
    try {
      const result = await setCommunityCommentLikeAction(commentId, postId, nextLiked)
      if (result.success) {
        dispatch({ type: "success", snapshot: { liked: result.liked, count: result.likeCount, version: result.likeVersion } })
      } else {
        dispatch({ type: "failure", error: locale === "ja" ? fallback : result.error })
      }
    } catch {
      dispatch({ type: "failure", error: fallback })
    } finally {
      inFlight.current = false
    }
  }

  const actionLabel = locale === "ja"
    ? state.liked ? "コメントのいいねを取り消す" : "コメントにいいねする"
    : state.liked ? "取消评论点赞" : "给评论点赞"
  const countLabel = locale === "ja" ? `${state.count}件のいいね` : `${state.count}个赞`
  return (
    <>
      <button
        type="button"
        onClick={setLiked}
        disabled={!canWrite || state.pending}
        aria-label={`${actionLabel}，${countLabel}`}
        aria-pressed={state.liked}
        aria-busy={state.pending}
        aria-describedby={state.error ? errorId : undefined}
        className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50 ${state.liked ? "text-rose-500" : "hover:text-rose-500"}`}
      >
        <Heart aria-hidden="true" className={`size-3.5 ${state.liked ? "fill-current" : ""}`} />
        <span aria-hidden="true">{state.count}</span>
      </button>
      {state.error ? <span id={errorId} role="status" className="basis-full text-xs text-destructive">{state.error}</span> : null}
    </>
  )
}
