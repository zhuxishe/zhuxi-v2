"use client"

import { useState } from "react"
import { Languages, Monitor, Smartphone } from "lucide-react"
import { HeroSchoolPie } from "@/components/landing/HeroSchoolPie"
import { cn } from "@/lib/utils"
import type { HomepageSchoolStatsDraft } from "./types"

type PreviewLocale = "zh" | "ja"
type PreviewViewport = "mobile" | "desktop"

const SEGMENT_CLASS = "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-primary"

export function HomepageStatsPreview({ stats }: { stats: HomepageSchoolStatsDraft }) {
  const [locale, setLocale] = useState<PreviewLocale>("zh")
  const [viewport, setViewport] = useState<PreviewViewport>("mobile")

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm" aria-labelledby="homepage-stats-preview-title">
      <div className="border-b border-border p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between xl:flex-col xl:items-stretch 2xl:flex-row 2xl:items-center">
          <div>
            <h2 id="homepage-stats-preview-title" className="font-semibold text-foreground">主页实时预览</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">预览只显示当前编辑内容，点击发布前不会影响主页。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div role="group" aria-label="预览语言" className="flex rounded-lg bg-muted p-1">
              <button type="button" aria-pressed={locale === "zh"} onClick={() => setLocale("zh")} className={cn(SEGMENT_CLASS, locale === "zh" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground") }>
                <Languages className="size-3.5" aria-hidden="true" />中文
              </button>
              <button type="button" aria-pressed={locale === "ja"} onClick={() => setLocale("ja")} className={cn(SEGMENT_CLASS, locale === "ja" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground") }>
                日本語
              </button>
            </div>
            <div role="group" aria-label="预览设备" className="flex rounded-lg bg-muted p-1">
              <button type="button" aria-pressed={viewport === "mobile"} onClick={() => setViewport("mobile")} className={cn(SEGMENT_CLASS, viewport === "mobile" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground") }>
                <Smartphone className="size-3.5" aria-hidden="true" />移动
              </button>
              <button type="button" aria-pressed={viewport === "desktop"} onClick={() => setViewport("desktop")} className={cn(SEGMENT_CLASS, viewport === "desktop" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground") }>
                <Monitor className="size-3.5" aria-hidden="true" />桌面
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto bg-[#f3f1e9] p-4">
        <div
          className={cn(
            "mx-auto rounded-[1.4rem] bg-[#fffdf7] p-3 shadow-inner transition-[width] duration-300",
            viewport === "mobile" ? "w-[23.5rem] max-w-none" : "w-[47rem] max-w-none",
          )}
          aria-label={`${locale === "ja" ? "日文" : "中文"}${viewport === "mobile" ? "移动端" : "桌面端"}预览`}
        >
          <HeroSchoolPie stats={{ ...stats, version: 1, publishedAt: null }} ja={locale === "ja"} viewport={viewport} />
        </div>
      </div>
    </section>
  )
}
