"use client"

import { History, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { HomepageSchoolStatsHistoryItem } from "./types"

const ACTION_LABELS: Record<HomepageSchoolStatsHistoryItem["action"], string> = {
  seed: "初始版本",
  publish: "直接发布",
  restore: "历史恢复",
}

function formatDate(value: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

export function HomepageStatsHistory({
  items,
  currentVersion,
  pending,
  onRestore,
}: {
  items: HomepageSchoolStatsHistoryItem[]
  currentVersion: number
  pending: boolean
  onRestore: (item: HomepageSchoolStatsHistoryItem) => void
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm" aria-labelledby="homepage-stats-history-title">
      <div className="flex items-start gap-3 border-b border-border p-4 sm:p-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <History className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 id="homepage-stats-history-title" className="font-semibold text-foreground">发布历史</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">每次发布和恢复都会生成新版本，已有记录不会被覆盖。</p>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">暂时没有发布历史</p>
      ) : (
        <ol className="divide-y divide-border">
          {items.map((item) => {
            const isCurrent = item.version === currentVersion
            return (
              <li
                key={String(item.id)}
                className="p-4 sm:p-5"
                style={{ contentVisibility: "auto", containIntrinsicSize: "0 190px" }}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">版本 {item.version}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{ACTION_LABELS[item.action]}</span>
                      {item.action === "restore" && item.restoredFromVersion != null ? (
                        <span className="text-xs text-muted-foreground">来自版本 {item.restoredFromVersion}</span>
                      ) : null}
                      {isCurrent ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">当前版本</span> : null}
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                      <div><dt className="text-xs text-muted-foreground">总人数</dt><dd className="mt-0.5 font-medium">{item.totalMembers}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">学校总数</dt><dd className="mt-0.5 font-medium">{item.totalSchools}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">精选学校</dt><dd className="mt-0.5 font-medium">{item.featuredSchools.length}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">发布者</dt><dd className="mt-0.5 truncate font-medium">{item.publishedByName}</dd></div>
                    </dl>
                    <p className="mt-3 text-xs text-muted-foreground">{formatDate(item.publishedAt)}（日本时间）</p>
                    <details className="mt-3 text-sm">
                      <summary className="w-fit cursor-pointer rounded text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary">查看该版本学校明细</summary>
                      <ul className="mt-2 grid gap-1.5 rounded-lg bg-muted/60 p-3 sm:grid-cols-2 lg:grid-cols-3">
                        {item.featuredSchools.length === 0 ? <li className="text-xs text-muted-foreground">该版本未设置精选学校，全部人数归入“其他”。</li> : item.featuredSchools.map((school) => (
                          <li key={school.id} className="flex min-w-0 justify-between gap-2 text-xs">
                            <span className="truncate">{school.zh} / <span lang="ja">{school.ja}</span></span>
                            <span className="shrink-0 font-medium">{school.count} 人</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </div>
                  <Button type="button" variant="outline" disabled={pending || isCurrent} onClick={() => onRestore(item)}>
                    <RotateCcw aria-hidden="true" />
                    {isCurrent ? "当前版本" : "恢复此版本"}
                  </Button>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
