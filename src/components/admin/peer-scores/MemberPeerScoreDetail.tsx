import Link from "next/link"
import { ArrowLeft, ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react"
import { formatAdminDate, formatAdminDateTime } from "@/lib/admin-datetime"
import type { MemberPeerScoreDetail as Detail, MemberPeerScoreDetailFilters, PeerScoreDetailReview } from "@/types/member-peer-score-detail"

const SAMPLE_LABELS = { ready: "样本达标", accumulating: "积累中", unrated: "暂无有效评分" }
const linkClass = "inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
const cardClass = "rounded-xl border border-border bg-card p-4 sm:p-5"

export function memberPeerScoreDetailHref(memberId: string, filters: MemberPeerScoreDetailFilters) {
  const query = new URLSearchParams()
  if (filters.validity !== "valid") query.set("validity", filters.validity)
  if (filters.roundId) query.set("roundId", filters.roundId)
  if (filters.page > 1) query.set("page", String(filters.page))
  return `/admin/peer-scores/${encodeURIComponent(memberId)}${query.size ? `?${query}` : ""}`
}

export function MemberPeerScoreDetail({ data }: { data: Detail }) {
  const { member, summary, filters, operationalScore } = data
  const byReviewer = new Map<string, PeerScoreDetailReview[]>()
  for (const review of data.reviews) byReviewer.set(review.reviewerId, [...(byReviewer.get(review.reviewerId) ?? []), review])
  const summaries = new Map(data.reviewers.map(reviewer => [reviewer.reviewerId, reviewer]))
  const pages = Math.max(1, Math.ceil(data.total / filters.pageSize))
  const currentDisplay = operationalScore?.status === "published" && operationalScore.score !== null ? `${operationalScore.score.toFixed(1)} / 5` : "待评估"

  return <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
    <Link href="/admin/peer-scores" className={`${linkClass} -ml-2`}><ArrowLeft className="size-4" aria-hidden="true" />返回合拍分数名单</Link>
    <section className={cardClass} aria-labelledby="peer-score-member-name">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="peer-score-member-name" className="break-words text-xl font-semibold">{member.name || "未填写姓名"}</h2>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>昵称：{member.nickname || "未填写"}</span>
            {data.canViewMemberNumber && <span>会员编号：{member.memberNumber || "未分配"}</span>}
          </div>
        </div>
        <Link href={`/admin/members/${member.id}?tab=activity`} className={linkClass}>成员资料与参与记录<ArrowUpRight className="size-4" aria-hidden="true" /></Link>
      </div>
    </section>

    <section className={cardClass} aria-labelledby="peer-score-summary-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="peer-score-summary-title" className="font-semibold">长期合拍分（后台试算）</h3>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{SAMPLE_LABELS[summary.sampleStatus]}</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="试算分数" value={summary.score === null ? "暂无有效评分" : `${summary.score.toFixed(1)} / 5`} />
        <Metric label="不同评价人数" value={`${summary.reviewerCount} 人`} />
        <Metric label="收到有效评分的活动" value={`${summary.activityCount} 场`} />
        <Metric label="有效评分记录" value={`${summary.reviewCount} 条`} />
      </dl>
      <p className="mt-4 text-sm leading-6">{summary.eligibleForPublication ? "已满足 2 位不同评价人、3 场活动的样本门槛。" : "公开样本门槛为 2 位不同评价人、3 场活动。"}当前仅供后台试算，不会自动替换会员端分数。</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">先计算每位评价人跨活动有效评分的均值，再对评价人等权平均。此处使用全部有效单项评价，不随下方筛选或分页改变；旧五项评价、A/B/C/D 和运营分不计入。</p>
      {summary.latestReviewAt && <p className="mt-2 text-xs text-muted-foreground">最近收到有效评分：{formatAdminDateTime(summary.latestReviewAt)}（日本时间）</p>}
    </section>

    <section className={cardClass} aria-labelledby="peer-score-operational-title">
      <h3 id="peer-score-operational-title" className="font-semibold">会员端当前合拍分与运营备注</h3>
      {operationalScore ? <>
        <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="会员端当前显示" value={currentDisplay} />
          <Metric label="后台保存的运营分" value={operationalScore.score === null ? "未记录" : `${operationalScore.score.toFixed(1)} / 5`} />
          <Metric label="展示状态" value={operationalScore.status === "published" ? "已发布" : "待评估"} />
          <Metric label="分数来源" value={operationalScore.source === "manual" ? "人工维护" : "初始分"} />
        </dl>
        <div className="mt-4 border-t border-border pt-4">
          <h4 className="text-sm font-medium">运营备注</h4>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{operationalScore.internalNote?.trim() || "暂无运营备注"}</p>
        </div>
        <dl className="mt-3 grid gap-2 text-xs leading-5 text-muted-foreground sm:grid-cols-2">
          <div><dt className="inline">指标发布人：</dt><dd className="inline">{operationalScore.publishedByName || "未记录"}</dd></div>
          <div><dt className="inline">指标最近修改人：</dt><dd className="inline">{operationalScore.updatedByName || "未记录"}</dd></div>
          <div><dt className="inline">指标发布时间：</dt><dd className="inline">{formatAdminDateTime(operationalScore.publishedAt, "未发布")}</dd></div>
          <div><dt className="inline">指标更新时间：</dt><dd className="inline">{formatAdminDateTime(operationalScore.updatedAt, "未记录")}</dd></div>
        </dl>
      </> : <p role="status" className="mt-3 text-sm text-muted-foreground">尚无运营分记录，会员端显示待评估。</p>}
    </section>

    <section id="peer-score-reviews" className={`${cardClass} scroll-mt-5`} aria-labelledby="peer-score-reviews-title">
      <h3 id="peer-score-reviews-title" className="font-semibold">收到的活动评价</h3>
      <form action={`/admin/peer-scores/${member.id}`} method="get" className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="grid gap-1.5 text-xs font-medium sm:w-40">评分状态
          <select name="validity" defaultValue={filters.validity} className="min-h-11 rounded-lg border border-input bg-background px-3 text-sm">
            <option value="valid">有效评价</option><option value="invalid">无效评价</option><option value="all">全部评价</option>
          </select>
        </label>
        <label className="grid min-w-0 flex-1 gap-1.5 text-xs font-medium">活动
          <select name="roundId" defaultValue={filters.roundId ?? ""} className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">
            <option value="">全部活动</option>
            {filters.roundId && !data.activities.some(activity => activity.roundId === filters.roundId) && <option value={filters.roundId}>所选活动（暂无评分记录）</option>}
            {data.activities.map(activity => <option key={activity.roundId} value={activity.roundId}>{activity.name || "未命名活动"}</option>)}
          </select>
        </label>
        <button type="submit" className="min-h-11 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground">应用筛选</button>
        {(filters.validity !== "valid" || filters.roundId) && <Link href={`/admin/peer-scores/${member.id}`} className={linkClass}>清除筛选</Link>}
      </form>

      {data.activities.length > 0 && <details className="mt-4 rounded-lg border border-border px-3 py-2">
        <summary className="min-h-10 cursor-pointer py-2 text-sm font-medium">活动记录与评分汇总（{data.activities.length} 场）</summary>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">按报名、互评名册及评价记录列出全部关联活动。报名或列入名册不等同于已签到；场均分仅供查看该活动。</p>
        <div className="my-3 grid gap-3 md:grid-cols-2">
          {data.activities.map(activity => <article key={activity.roundId} className="rounded-lg bg-muted/30 p-3">
            <h4 className="break-words text-sm font-medium">{activity.name || "未命名活动"}</h4>
            <p className="mt-1 text-xs text-muted-foreground">{activityDates(activity.activityStart, activity.activityEnd)}</p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
              <span className="rounded-full border border-border px-2 py-1">{activity.registrationStatus === "active" ? "已报名" : activity.registrationStatus === "cancelled" ? "报名已取消" : "无报名记录"}</span>
              {activity.inReviewRoster && <span className="rounded-full border border-border px-2 py-1">{activity.rosterIncluded ? "列入互评名册" : "已移出互评名册"}{activity.rosterSource === "manual" ? " · 管理员补录" : ""}</span>}
            </div>
            <p className="mt-2 text-xs leading-5">{activity.reviewCount > 0 ? `有效 ${activity.reviewCount} 条 · ${activity.reviewerCount} 位评价人 · 场均分 ${activity.averageScore?.toFixed(2) ?? "暂无"}` : "本场暂无有效评价"}{activity.invalidReviewCount > 0 ? ` · 无效 ${activity.invalidReviewCount} 条` : ""}</p>
            <div className="mt-1 flex flex-wrap gap-x-2">
              <Link className={linkClass} href={memberPeerScoreDetailHref(member.id, { ...filters, roundId: activity.roundId, page: 1 })}>筛选本场</Link>
              <Link className={linkClass} href={`/admin/matching/rounds/${activity.roundId}`}>活动与报名记录<ArrowUpRight className="size-3.5" aria-hidden="true" /></Link>
            </div>
          </article>)}
        </div>
      </details>}

      <p className="mt-5 text-xs leading-5 text-muted-foreground">筛选后共 {data.total} 条，本页 {data.reviews.length} 条。按评价人展示本页记录；每人的均值与数量来自其全部有效评价。</p>
      {data.reviews.length === 0 ? <p role="status" className="mt-4 rounded-lg bg-muted/30 p-4 text-sm">{summary.reviewCount === 0 && filters.validity === "valid" && !filters.roundId ? "该成员暂无有效单项评价。" : "当前筛选条件下没有评价记录。"}</p> :
        <div className="mt-4 space-y-4">{[...byReviewer].map(([reviewerId, reviews]) => {
          const full = summaries.get(reviewerId), first = reviews[0]
          return <article key={reviewerId} className="overflow-hidden rounded-xl border border-border">
            <div className="flex flex-wrap items-start justify-between gap-3 bg-muted/30 px-4 py-3">
              <div className="min-w-0">
                <Link href={`/admin/members/${reviewerId}`} className="break-words text-sm font-semibold text-primary hover:underline">{first.reviewerName || "未填写姓名"}</Link>
                <p className="mt-1 break-words text-xs text-muted-foreground">昵称：{first.reviewerNickname || "未填写"} · 本页 {reviews.length} 条</p>
              </div>
              <div className="text-sm tabular-nums"><p>跨活动有效均值 <strong>{full ? `${full.score.toFixed(2)} / 5` : "暂无"}</strong></p><p className="mt-1 text-xs text-muted-foreground">{full ? `${full.reviewCount} 条有效评价 · ${full.activityCount} 场活动` : "该评价人尚无有效记录"}</p></div>
            </div>
            <div className="divide-y divide-border">{reviews.map(review => <div key={review.reviewId} className="space-y-3 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><h5 className="break-words text-sm font-medium">{review.roundName || "未命名活动"}</h5><p className="mt-1 text-xs text-muted-foreground">{activityDates(review.activityStart, review.activityEnd)}</p></div>
                <div className="shrink-0 text-right"><span className="text-lg font-semibold tabular-nums">{review.score.toFixed(1)}</span><span className="ml-1 text-xs text-muted-foreground">/ 5</span><p className={`mt-1 text-xs ${review.valid ? "text-primary" : "text-muted-foreground"}`}>{review.valid ? "有效" : "无效 · 不计分"}</p></div>
              </div>
              <div><p className="text-xs text-muted-foreground">玩家留言</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{review.comment.trim() || "未填写留言"}</p></div>
              {!review.valid && <div className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-950"><p>无效原因：{review.invalidationReason || "未记录，请查看原评价审核记录"}</p>{review.invalidatedAt && <p className="mt-1">标记时间：{formatAdminDateTime(review.invalidatedAt)}（日本时间）</p>}</div>}
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"><p className="text-xs leading-5 text-muted-foreground">更新：{formatAdminDateTime(review.updatedAt)}（日本时间）</p><Link href={`/admin/activity-reviews?${new URLSearchParams({ roundId: review.roundId, memberId: member.id })}`} className={linkClass}>原评价审核<ArrowUpRight className="size-3.5" aria-hidden="true" /></Link></div>
            </div>)}</div>
          </article>
        })}</div>}
      {pages > 1 && <nav aria-label="评价记录分页" className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-sm">
        <span className="text-muted-foreground">第 {filters.page} / {pages} 页</span>
        <div className="flex gap-2">
          {filters.page > 1 && <Link className={linkClass} href={memberPeerScoreDetailHref(member.id, { ...filters, page: filters.page - 1 })}><ChevronLeft className="size-4" aria-hidden="true" />上一页</Link>}
          {filters.page < pages && <Link className={linkClass} href={memberPeerScoreDetailHref(member.id, { ...filters, page: filters.page + 1 })}>下一页<ChevronRight className="size-4" aria-hidden="true" /></Link>}
        </div>
      </nav>}
    </section>
  </div>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-lg bg-muted/30 px-3 py-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-2 break-words text-lg font-semibold tabular-nums">{value}</dd></div>
}

function activityDates(start: string | null, end: string | null) {
  if (!start && !end) return "活动日期未记录"
  const from = formatAdminDate(start, "未记录"), to = formatAdminDate(end, "未记录")
  return from === to ? from : `${from} — ${to}`
}
