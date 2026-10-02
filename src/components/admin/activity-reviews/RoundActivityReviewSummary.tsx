import Link from "next/link"
import { Star } from "lucide-react"
import type { AdminActivityReviewEvent } from "@/lib/activity-reviews/types"
import { formatAdminDateTime } from "@/lib/admin-datetime"

const STATUS_LABELS = { unavailable: "未开放", scheduled: "待开放", open: "开放中", closed: "已截止", paused: "已暂停" } as const

export function RoundActivityReviewSummary({ roundId, summary }: { roundId: string; summary: AdminActivityReviewEvent | null }) {
  return <section className="rounded-xl border border-primary/20 bg-primary/5 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-sm font-semibold"><Star className="size-4 text-primary" />活动互评 <span className="text-xs font-normal text-muted-foreground">{summary && summary.settings.version > 0 ? STATUS_LABELS[summary.status] : "待配置"}</span></h2><p className="mt-2 text-xs leading-5 text-muted-foreground">独立于报名状态。确认活动到场名册后，可开放 1–5 分体验评分与文字评价。</p></div>
      <Link href={`/admin/activity-reviews?roundId=${encodeURIComponent(roundId)}`} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">管理活动互评</Link>
    </div>
    {summary ? <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-primary/10 pt-3 text-xs text-muted-foreground"><span>名册 {summary.participantCount} 人</span><span>评分 {summary.reviewCount} 条</span><span>待处理举报 {summary.pendingReportCount} 条</span><span>截止：{formatAdminDateTime(summary.closesAt, "未设置")}（日本时间）</span></div> : null}
  </section>
}
