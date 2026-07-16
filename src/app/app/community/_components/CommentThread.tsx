"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Check, Pencil, Send, Trash2, X } from "lucide-react"
import {
  addCommunityCommentAction,
  deleteCommunityCommentAction,
  reportCommunityContentAction,
  updateCommunityCommentAction,
} from "@/app/app/community/actions"
import { CommunityAvatar } from "@/components/community/CommunityAvatar"
import type { CommunityComment } from "@/lib/community/types"

interface CommentThreadProps {
  postId: string
  comments: CommunityComment[]
  canWrite: boolean
  locale: "zh" | "ja"
}

export function CommentThread({ postId, comments, canWrite, locale }: CommentThreadProps) {
  const router = useRouter()
  const [body, setBody] = useState("")
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [reportTarget, setReportTarget] = useState<string | null>(null)
  const [reportReason, setReportReason] = useState("inappropriate")
  const [reportDetails, setReportDetails] = useState("")
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const label = (zh: string, ja: string) => locale === "ja" ? ja : zh

  function send() {
    if (!body.trim() || pending) return
    const text = body
    startTransition(async () => {
      const result = await addCommunityCommentAction(postId, replyTo, text)
      if (!result.success) setError(result.error || label("评论失败", "コメントに失敗しました"))
      else {
        setBody("")
        setReplyTo(null)
        setError("")
        router.refresh()
      }
    })
  }

  function remove(commentId: string) {
    startTransition(async () => {
      const result = await deleteCommunityCommentAction(commentId, postId)
      if (!result.success) setError(result.error || label("删除失败", "削除に失敗しました"))
      else router.refresh()
    })
  }

  function update(commentId: string, nextBody: string) {
    startTransition(async () => {
      const result = await updateCommunityCommentAction(commentId, postId, nextBody)
      if (!result.success) setError(result.error || label("保存失败", "保存に失敗しました"))
      else {
        setError("")
        router.refresh()
      }
    })
  }

  function submitReport() {
    if (!reportTarget) return
    startTransition(async () => {
      const result = await reportCommunityContentAction("comment", reportTarget, reportReason, reportDetails)
      if (!result.success) setError(result.error || label("举报失败", "報告に失敗しました"))
      else {
        setError(label("已提交举报", "報告を送信しました"))
        setReportTarget(null)
        setReportDetails("")
      }
    })
  }

  return (
    <>
      <div className="space-y-4">
        {comments.map((comment) => (
          <CommentItem key={comment.id} comment={comment} locale={locale} rootCommentId={comment.id} onReply={setReplyTo} onDelete={remove} onEdit={update} onReport={setReportTarget} />
        ))}
      </div>
      <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-1/2 z-40 w-full max-w-md -translate-x-1/2 border-t border-border bg-card/95 p-2 backdrop-blur-md">
        <div className="flex items-end gap-2">
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                send()
              }
            }}
            disabled={!canWrite}
            rows={1}
            maxLength={500}
            placeholder={replyTo ? label("写回复……", "返信を書く……") : label("写评论……", "コメントを書く……")}
            className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
          />
          <button type="button" onClick={send} disabled={!canWrite || !body.trim() || pending} aria-label={label("发送", "送信")} className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"><Send className="size-5" /></button>
        </div>
        {error && <p role="status" className="px-2 pt-1 text-xs text-destructive">{error}</p>}
      </div>
      {reportTarget && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl bg-card p-4 shadow-2xl">
            <div className="flex items-center justify-between"><h2 className="font-semibold">{label("举报评论", "コメントを報告")}</h2><button type="button" onClick={() => setReportTarget(null)} className="grid size-11 place-items-center"><X className="size-5" /></button></div>
            <select value={reportReason} onChange={(event) => setReportReason(event.target.value)} className="mt-3 min-h-11 w-full rounded-xl border border-input bg-background px-3">
              <option value="harassment">{label("骚扰或攻击", "嫌がらせ・攻撃")}</option>
              <option value="privacy">{label("泄露隐私", "プライバシー侵害")}</option>
              <option value="spam">{label("垃圾或广告", "スパム・広告")}</option>
              <option value="inappropriate">{label("不当内容", "不適切な内容")}</option>
              <option value="other">{label("其他", "その他")}</option>
            </select>
            <textarea value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={2000} rows={4} placeholder={label("补充说明（选填）", "補足（任意）")} className="mt-3 w-full resize-none rounded-xl border border-input bg-background p-3" />
            <button type="button" disabled={pending} onClick={submitReport} className="mt-3 min-h-11 w-full rounded-xl bg-destructive font-semibold text-white disabled:opacity-50">{label("提交举报", "報告を送信")}</button>
          </div>
        </div>
      )}
    </>
  )
}

function CommentItem({
  comment,
  locale,
  rootCommentId,
  onReply,
  onDelete,
  onEdit,
  onReport,
}: {
  comment: CommunityComment
  locale: "zh" | "ja"
  rootCommentId: string
  onReply: (commentId: string) => void
  onDelete: (commentId: string) => void
  onEdit: (commentId: string, body: string) => void
  onReport: (commentId: string) => void
}) {
  const label = (zh: string, ja: string) => locale === "ja" ? ja : zh
  const [editing, setEditing] = useState(false)
  const [editBody, setEditBody] = useState(comment.body ?? "")
  const deleted = comment.status === "deleted"
  const hidden = comment.status === "hidden" || comment.removalSource === "admin"
  const name = comment.isAnonymousAuthor
    ? label("匿名楼主", "匿名の投稿者")
    : comment.author?.nickname ?? label("匿名会员", "匿名会員")
  const body = hidden
    ? label("该评论已由管理员移除", "管理者がこのコメントを削除しました")
    : deleted
      ? label("该评论已由作者删除", "投稿者がこのコメントを削除しました")
      : comment.body

  return (
    <div id={`comment-${comment.id}`} className="flex scroll-mt-24 gap-3">
      <CommunityAvatar profile={comment.isAnonymousAuthor ? null : comment.author} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl bg-card px-3 py-2 shadow-soft">
          <p className="text-xs font-semibold">
            {name}
            {comment.editedAt && !deleted && !hidden ? <span className="ml-1 font-normal text-muted-foreground">· {label("已编辑", "編集済み")}</span> : null}
          </p>
          {editing ? (
            <div className="mt-2">
              <textarea
                value={editBody}
                onChange={(event) => setEditBody(event.target.value)}
                rows={3}
                maxLength={500}
                autoFocus
                className="w-full resize-none rounded-xl border border-input bg-background p-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" onClick={() => { setEditBody(comment.body ?? ""); setEditing(false) }} className="inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-xs text-muted-foreground"><X className="size-3.5" />{label("取消", "キャンセル")}</button>
                <button
                  type="button"
                  disabled={!editBody.trim() || editBody.trim() === comment.body}
                  onClick={() => { onEdit(comment.id, editBody); setEditing(false) }}
                  className="inline-flex min-h-9 items-center gap-1 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-40"
                >
                  <Check className="size-3.5" />{label("保存", "保存")}
                </button>
              </div>
            </div>
          ) : (
            <p className={`mt-1 whitespace-pre-wrap text-sm leading-6 ${deleted || hidden ? "text-muted-foreground" : "text-foreground"}`}>{body}</p>
          )}
        </div>
        {!deleted && !hidden && !editing && (
          <div className="mt-1 flex items-center gap-3 px-2 text-xs text-muted-foreground">
            <button type="button" onClick={() => onReply(rootCommentId)} className="min-h-9">{label("回复", "返信")}</button>
            {comment.isMine ? (
              <>
                <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-9 items-center gap-1"><Pencil className="size-3" />{label("编辑", "編集")}</button>
                <button type="button" onClick={() => onDelete(comment.id)} className="inline-flex min-h-9 items-center gap-1 text-destructive"><Trash2 className="size-3" />{label("删除", "削除")}</button>
              </>
            ) : <button type="button" onClick={() => onReport(comment.id)} className="min-h-9">{label("举报", "報告")}</button>}
          </div>
        )}
        {comment.replies?.length ? (
          <div className="mt-3 space-y-3 border-l-2 border-primary/15 pl-3">
            {comment.replies.map((reply) => (
              <CommentItem key={reply.id} comment={reply} locale={locale} rootCommentId={rootCommentId} onReply={onReply} onDelete={onDelete} onEdit={onEdit} onReport={onReport} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
