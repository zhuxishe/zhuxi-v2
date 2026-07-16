"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Ellipsis, EyeOff, Flag, Pencil, ShieldOff, Trash2, X } from "lucide-react"
import {
  blockCommunityProfileAction,
  deleteCommunityPostAction,
  hideCommunityPostAction,
  reportCommunityContentAction,
} from "@/app/app/community/actions"
import type { CommunityPost } from "@/lib/community/types"

export function CommunityPostMenu({ post, locale }: { post: CommunityPost; locale: "zh" | "ja" }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reason, setReason] = useState("inappropriate")
  const [details, setDetails] = useState("")
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const label = (zh: string, ja: string) => locale === "ja" ? ja : zh

  function run(action: () => Promise<{ success: boolean; error?: string }>) {
    setError("")
    startTransition(async () => {
      const result = await action()
      if (!result.success) setError(result.error || label("操作失败", "操作に失敗しました"))
      else {
        setOpen(false)
        router.refresh()
      }
    })
  }

  function report() {
    startTransition(async () => {
      const result = await reportCommunityContentAction("post", post.id, reason, details)
      if (!result.success) setError(result.error || label("举报失败", "報告に失敗しました"))
      else {
        setReportOpen(false)
        setOpen(false)
        router.refresh()
      }
    })
  }

  return (
    <div className="relative">
      <button type="button" aria-label={label("更多操作", "その他の操作")} aria-expanded={open} onClick={() => setOpen((value) => !value)} className="grid size-11 place-items-center rounded-full text-muted-foreground hover:bg-secondary">
        <Ellipsis className="size-5" />
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-20 w-44 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-xl">
          {post.isMine ? (
            <>
              <Link href={`/app/community/${post.postType === "photo" ? "photos" : "treehole"}/${post.id}/edit`} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm hover:bg-secondary">
                <Pencil className="size-4" />{label("编辑", "編集")}
              </Link>
              <button type="button" disabled={pending} onClick={() => {
                if (window.confirm(label("确定删除这条内容吗？", "この投稿を削除しますか？"))) run(() => deleteCommunityPostAction(post.id))
              }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm text-destructive hover:bg-destructive/10">
                <Trash2 className="size-4" />{label("删除", "削除")}
              </button>
            </>
          ) : (
            <>
              <button type="button" disabled={post.isReported} onClick={() => setReportOpen(true)} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm hover:bg-secondary disabled:opacity-50">
                <Flag className="size-4" />{post.isReported ? label("已举报", "報告済み") : label("举报", "報告")}
              </button>
              <button type="button" onClick={() => run(() => hideCommunityPostAction(post.id))} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm hover:bg-secondary">
                <EyeOff className="size-4" />{label("仅对我隐藏", "自分だけ非表示")}
              </button>
              {!post.isAnonymous && post.author && (
                <button type="button" onClick={() => run(() => blockCommunityProfileAction(post.author!.id))} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm hover:bg-secondary">
                  <ShieldOff className="size-4" />{label("屏蔽会员", "会員をブロック")}
                </button>
              )}
            </>
          )}
          {error && <p className="px-3 py-2 text-xs text-destructive">{error}</p>}
        </div>
      )}

      {reportOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="report-title">
          <div className="w-full max-w-sm rounded-2xl bg-card p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 id="report-title" className="font-semibold">{label("举报内容", "内容を報告")}</h2>
              <button type="button" onClick={() => setReportOpen(false)} className="grid size-11 place-items-center rounded-full"><X className="size-5" /></button>
            </div>
            <label className="mt-3 block text-sm font-medium">
              {label("举报原因", "報告理由")}
              <select value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-input bg-background px-3">
                <option value="harassment">{label("骚扰或攻击", "嫌がらせ・攻撃")}</option>
                <option value="privacy">{label("泄露隐私", "プライバシー侵害")}</option>
                <option value="spam">{label("垃圾或广告", "スパム・広告")}</option>
                <option value="inappropriate">{label("不当内容", "不適切な内容")}</option>
                <option value="other">{label("其他", "その他")}</option>
              </select>
            </label>
            <label className="mt-3 block text-sm font-medium">
              {label("补充说明（选填）", "補足（任意）")}
              <textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={2000} rows={4} className="mt-1 w-full resize-none rounded-xl border border-input bg-background p-3" />
            </label>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            <button type="button" disabled={pending} onClick={report} className="mt-4 min-h-11 w-full rounded-xl bg-destructive px-4 text-sm font-semibold text-white disabled:opacity-50">
              {label("提交举报", "報告を送信")}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
