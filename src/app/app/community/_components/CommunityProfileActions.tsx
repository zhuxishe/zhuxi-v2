"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Flag, ShieldOff, X } from "lucide-react"
import {
  blockCommunityProfileAction,
  reportCommunityContentAction,
} from "@/app/app/community/actions"

export function CommunityProfileActions({ profileId, locale }: { profileId: string; locale: "zh" | "ja" }) {
  const router = useRouter()
  const [reportOpen, setReportOpen] = useState(false)
  const [reason, setReason] = useState("inappropriate")
  const [details, setDetails] = useState("")
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const label = (zh: string, ja: string) => locale === "ja" ? ja : zh

  function block() {
    if (!window.confirm(label("屏蔽后将不再看到对方的公开内容，是否继续？", "この会員をブロックしますか？"))) return
    startTransition(async () => {
      const result = await blockCommunityProfileAction(profileId)
      if (!result.success) setError(result.error || label("屏蔽失败", "ブロックに失敗しました"))
      else router.push("/app/community")
    })
  }

  function report() {
    startTransition(async () => {
      const result = await reportCommunityContentAction("profile", profileId, reason, details)
      if (!result.success) setError(result.error || label("举报失败", "報告に失敗しました"))
      else {
        setReportOpen(false)
        setError(label("举报已提交", "報告を送信しました"))
      }
    })
  }

  return (
    <>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setReportOpen(true)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border text-sm font-medium"><Flag className="size-4" />{label("举报", "報告")}</button>
        <button type="button" disabled={pending} onClick={block} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border text-sm font-medium"><ShieldOff className="size-4" />{label("屏蔽会员", "ブロック")}</button>
      </div>
      {error && <p role="status" className="mt-2 text-sm text-destructive">{error}</p>}
      {reportOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl bg-card p-4 shadow-2xl">
            <div className="flex items-center justify-between"><h2 className="font-semibold">{label("举报社区身份", "プロフィールを報告")}</h2><button type="button" onClick={() => setReportOpen(false)} className="grid size-11 place-items-center"><X className="size-5" /></button></div>
            <select value={reason} onChange={(event) => setReason(event.target.value)} className="mt-3 min-h-11 w-full rounded-xl border border-input bg-background px-3">
              <option value="harassment">{label("骚扰或攻击", "嫌がらせ・攻撃")}</option>
              <option value="privacy">{label("泄露隐私", "プライバシー侵害")}</option>
              <option value="spam">{label("垃圾或广告", "スパム・広告")}</option>
              <option value="inappropriate">{label("不当头像或昵称", "不適切な画像・名前")}</option>
              <option value="other">{label("其他", "その他")}</option>
            </select>
            <textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={2000} rows={4} placeholder={label("补充说明（选填）", "補足（任意）")} className="mt-3 w-full resize-none rounded-xl border border-input bg-background p-3" />
            <button type="button" disabled={pending} onClick={report} className="mt-3 min-h-11 w-full rounded-xl bg-destructive font-semibold text-white disabled:opacity-50">{label("提交举报", "報告を送信")}</button>
          </div>
        </div>
      )}
    </>
  )
}
