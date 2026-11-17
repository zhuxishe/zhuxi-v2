import Link from "next/link"
import { formatAdminDateTime } from "@/lib/admin-datetime"
import type { MemberPeerScoreResult } from "@/types/member-peer-score"

export function MemberPeerScoreCard({ result }: { result: MemberPeerScoreResult | { status: "error" | "loading" } }) {
  const data = result.status === "ready" ? result.data : null
  return (
    <section aria-labelledby="member-peer-score-title" className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h3 id="member-peer-score-title" className="font-semibold">长期合拍分（后台试算）</h3>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">仅供后台查看与人工参考，不改变会员端合拍分或匹配算法。原有个人主页运营分单独保留。</p>
      {result.status === "unavailable" ? <p role="status" className="mt-4 rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-950">后台试算暂未配置，待数据库功能就绪后可查看。其他成员资料可正常使用。</p> : null}
      {result.status === "error" ? <p role="alert" className="mt-4 rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-950">试算数据暂时读取失败，请稍后刷新。这不表示该成员没有有效评分。</p> : null}
      {result.status === "loading" ? <p role="status" className="mt-4 text-sm text-muted-foreground">正在读取后台试算…</p> : null}
      {data ? <>
        <dl className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="试算分数" value={data.score === null ? "暂无有效评分" : `${data.score.toFixed(1)} / 5`} />
          <Metric label="不同评价人数" value={`${data.reviewer_count} 人`} />
          <Metric label="收到有效评分的活动" value={`${data.activity_count} 场`} />
          <Metric label="有效评分记录" value={`${data.review_count} 条`} />
        </dl>
        <p className="mt-4 text-sm leading-6"><span className="font-medium">公开样本门槛：</span>{data.eligible_for_publication ? "已满足 2 位不同评价人、3 场活动的条件；当前仍仅后台试算，不会自动公开。" : "尚未满足 2 位不同评价人、3 场活动的条件；当前仍仅后台试算。"}</p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">先计算每位评价人所给有效评分的平均值，再对评价人等权平均。仅纳入有效单项活动评分，不计旧五项评价、A/B/C/D 或人工运营分。</p>
        {data.sources.length > 0 ? <details className="mt-5 border-t border-border pt-4">
          <summary className="min-h-8 cursor-pointer text-sm font-medium text-primary">查看评分来源（{data.sources.length} 位评价人）</summary>
          <div className="mt-3 space-y-3">
            {data.sources.map((source) => <article key={source.reviewer_id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><Link href={`/admin/members/${encodeURIComponent(source.reviewer_id)}`} className="break-words text-sm font-medium text-primary hover:underline">{source.reviewer_name || "未填写姓名"}</Link><p className="mt-1 text-xs text-muted-foreground">{source.review_count} 条有效评分 · {source.activity_count} 场活动</p></div>
                <p className="text-sm tabular-nums">此人平均 <strong>{source.score.toFixed(2)}</strong> / 5</p>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">{source.reviewer_name || "该评价人"}的有效评分明细</caption>
                  <thead className="border-b border-border text-xs text-muted-foreground"><tr><th scope="col" className="min-w-36 py-2 pr-3 font-medium">活动</th><th scope="col" className="whitespace-nowrap py-2 pr-3 font-medium">评分</th><th scope="col" className="whitespace-nowrap py-2 font-medium">更新时间（日本）</th></tr></thead>
                  <tbody>{source.reviews.map((review) => <tr key={review.review_id} className="border-b border-border/60 last:border-0"><td className="py-2 pr-3"><Link href={`/admin/activity-reviews?${new URLSearchParams({ roundId: review.round_id, memberId: data.member_id })}`} className="text-primary hover:underline">{review.round_name || "未命名活动"}</Link></td><td className="py-2 pr-3 tabular-nums">{review.score.toFixed(1)}</td><td className="whitespace-nowrap py-2 text-xs text-muted-foreground">{formatAdminDateTime(review.updated_at)}</td></tr>)}</tbody>
                </table>
              </div>
            </article>)}
          </div>
        </details> : null}
      </> : null}
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-muted/30 px-3 py-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-2 text-lg font-semibold tabular-nums">{value}</dd></div>
}
