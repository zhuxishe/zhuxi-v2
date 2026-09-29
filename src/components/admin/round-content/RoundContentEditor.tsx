"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { saveRoundContent, copyRound } from "@/app/admin/matching/rounds/[id]/content-actions"
import type { RoundContentDraft } from "@/types"
import { RoundBasicFields } from "./RoundBasicFields"
import { RoundCopyFields } from "./RoundCopyFields"
import { RoundModuleFields } from "./RoundModuleFields"
import { RoundQuestionFields } from "./RoundQuestionFields"
import { RoundContentPreview } from "./RoundContentPreview"
import { RoundTextField } from "./RoundTextField"
import { useUnsavedRoundContent } from "./use-unsaved-round-content"

interface Props { roundId: string; initial: RoundContentDraft; revision: number; locked: boolean; status: string }

export function RoundContentEditor({ roundId, initial, revision: initialRevision, locked, status }: Props) {
  const router = useRouter()
  const [draft, setDraft] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [revision, setRevision] = useState(initialRevision)
  const [locale, setLocale] = useState<"zh" | "ja">("zh")
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [pending, startTransition] = useTransition()
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)

  useUnsavedRoundContent(dirty)

  function save(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      setMessage(null)
      try {
        const result = await saveRoundContent(roundId, revision, draft)
        if (result.error) { setMessage({ text: result.error, error: true }); return }
        setRevision(result.revision ?? revision + 1)
        setSaved(draft)
        setMessage({ text: status === "open" ? "已保存，开放期间的玩家页面已更新。" : "已保存。返回详情后可开放本期内容。", error: false })
      } catch { setMessage({ text: "保存失败，请稍后重试；当前编辑内容已保留。", error: true }) }
    })
  }

  function duplicate() {
    if (dirty && !window.confirm("复制将使用已保存的内容。当前未保存修改会被放弃，继续吗？")) return
    startTransition(async () => {
      try {
        const result = await copyRound(roundId)
        if (result.error) { setMessage({ text: result.error, error: true }); return }
        router.push(`/admin/matching/rounds/${result.roundId}/edit`)
      } catch { setMessage({ text: "复制失败，请稍后重试。", error: true }) }
    })
  }

  return <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(380px,1fr)]">
    <form onSubmit={save} className="min-w-0 space-y-5">
      <div className="rounded-xl border bg-card p-4 text-sm">
        <p>编辑内容即时显示在右侧预览，保存前不影响玩家页面。</p>
        {status === "open" && <p className="mt-2 text-muted-foreground">本期已开放，保存后会立即更新玩家看到的文案。</p>}
        {locked && <p className="mt-2 text-amber-700">本期已有回答或匹配结果，用途、活动时间和问题结构已锁定。可修正文案；如需改变题意或结构，请复制为新一期。</p>}
      </div>
      <fieldset disabled={pending} className="space-y-5 disabled:opacity-70">
        <RoundBasicFields draft={draft} locked={locked} onChange={setDraft} />
        <div role="group" aria-label="编辑语言" className="flex gap-2">
          <Button type="button" variant={locale === "zh" ? "default" : "outline"} onClick={() => setLocale("zh")}>编辑中文</Button>
          <Button type="button" variant={locale === "ja" ? "default" : "outline"} onClick={() => setLocale("ja")}>编辑日文</Button>
        </div>
        <RoundCopyFields config={draft.contentConfig} locale={locale} onChange={(contentConfig) => setDraft({ ...draft, contentConfig })} />
        {draft.purpose === "matching" && <RoundModuleFields config={draft.contentConfig} locale={locale} locked={locked} onChange={(contentConfig) => setDraft({ ...draft, contentConfig })} />}
        {draft.purpose === "registration" && <section className="rounded-xl border bg-card p-5"><RoundTextField label="确认报名按钮文字" locale={locale} value={draft.contentConfig.labels.submit ?? { zh: "", ja: "" }} maxLength={40} onChange={(submit) => setDraft({ ...draft, contentConfig: { ...draft.contentConfig, labels: { ...draft.contentConfig.labels, submit } } })} /></section>}
        {draft.purpose !== "announcement" && <RoundQuestionFields config={draft.contentConfig} locale={locale} locked={locked} onChange={(contentConfig) => setDraft({ ...draft, contentConfig })} />}
      </fieldset>
      {message && <p role="status" className={`text-sm ${message.error ? "text-destructive" : "text-primary"}`}>{message.text}</p>}
      <div className="sticky bottom-3 z-20 flex flex-wrap gap-2 rounded-xl border bg-card/95 p-3 shadow-sm backdrop-blur">
        <Button type="submit" disabled={pending || !dirty}>{pending ? "处理中…" : "保存内容"}</Button>
        <Button type="button" variant="outline" onClick={duplicate} disabled={pending}>复制为新一期</Button>
        <Link href={`/admin/matching/rounds/${roundId}`} className="inline-flex items-center px-3 text-sm text-muted-foreground">返回详情</Link>
      </div>
    </form>
    <div className="min-w-0 xl:sticky xl:top-6"><RoundContentPreview draft={draft} /></div>
  </div>
}
