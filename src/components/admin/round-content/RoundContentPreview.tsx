"use client"

import { useState } from "react"
import { NextIntlClientProvider } from "next-intl"
import type { RoundContentDraft } from "@/types"
import zh from "@/messages/zh.json"
import ja from "@/messages/ja.json"
import { cn } from "@/lib/utils"
import { RoundPreviewContent } from "./RoundPreviewContent"

const SEGMENT = "rounded-md px-3 py-2 text-xs font-medium focus-visible:outline-2 focus-visible:outline-primary"

export function RoundContentPreview({ draft }: { draft: RoundContentDraft }) {
  const [locale, setLocale] = useState<"zh" | "ja">("zh")
  const [view, setView] = useState<"card" | "form">("form")
  const [viewport, setViewport] = useState<"mobile" | "desktop">("mobile")
  return <section className="overflow-hidden rounded-xl border bg-card shadow-sm" aria-labelledby="round-preview-title">
    <div className="space-y-3 border-b p-4">
      <div><h2 id="round-preview-title" className="font-semibold">问卷与活动实时预览</h2><p className="mt-1 text-xs text-muted-foreground">可试选问题；预览不会提交答案，也不会发布内容。</p></div>
      <div className="flex flex-wrap gap-2">
        <div role="group" aria-label="预览语言" className="flex rounded-lg bg-muted p-1">{(["zh", "ja"] as const).map((key) => <button key={key} type="button" className={cn(SEGMENT, locale === key && "bg-background shadow-sm")} aria-pressed={locale === key} onClick={() => setLocale(key)}>{key === "zh" ? "中文" : "日本語"}</button>)}</div>
        <div role="group" aria-label="预览内容" className="flex rounded-lg bg-muted p-1">{(["card", "form"] as const).map((key) => <button key={key} type="button" className={cn(SEGMENT, view === key && "bg-background shadow-sm")} aria-pressed={view === key} onClick={() => setView(key)}>{key === "card" ? "首页卡片" : "详情与问卷"}</button>)}</div>
        <div role="group" aria-label="预览设备" className="flex rounded-lg bg-muted p-1">{(["mobile", "desktop"] as const).map((key) => <button key={key} type="button" className={cn(SEGMENT, viewport === key && "bg-background shadow-sm")} aria-pressed={viewport === key} onClick={() => setViewport(key)}>{key === "mobile" ? "移动" : "桌面"}</button>)}</div>
      </div>
    </div>
    <div className="max-h-[80vh] overflow-auto bg-[#edf1e8] p-4">
      <div className={cn("mx-auto rounded-2xl bg-background p-5 shadow-inner", viewport === "mobile" ? "w-[375px]" : "w-[640px]")}>
        <NextIntlClientProvider locale={locale} messages={locale === "ja" ? ja : zh} timeZone="Asia/Tokyo">
          <RoundPreviewContent key={`${draft.purpose}:${locale}`} draft={draft} view={view} />
        </NextIntlClientProvider>
      </div>
    </div>
  </section>
}
