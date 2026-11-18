import Link from "next/link"
import { notFound, unstable_rethrow } from "next/navigation"
import { requireAdmin } from "@/lib/auth/admin"
import { isReviewUuid } from "@/lib/activity-reviews/validation"
import { fetchMemberPeerScoreDetail, parseMemberPeerScoreDetailFilters } from "@/lib/queries/member-peer-score-detail"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { MemberPeerScoreDetail, memberPeerScoreDetailHref } from "@/components/admin/peer-scores/MemberPeerScoreDetail"
import type { MemberPeerScoreDetailResult } from "@/types/member-peer-score-detail"

interface Props {
  params: Promise<{ memberId: string }>
  searchParams: Promise<{ validity?: string | string[]; roundId?: string | string[]; page?: string | string[] }>
}

export default async function MemberPeerScoreDetailPage({ params, searchParams }: Props) {
  const [admin, { memberId }, query] = await Promise.all([requireAdmin(), params, searchParams])
  if (!isReviewUuid(memberId)) notFound()
  const filters = parseMemberPeerScoreDetailFilters(query)
  let result: MemberPeerScoreDetailResult | { status: "error" }
  try {
    result = await fetchMemberPeerScoreDetail(memberId, filters)
    if (result.status === "ready") {
      const lastPage = Math.max(1, Math.ceil(result.data.total / filters.pageSize))
      if (filters.page > lastPage) result = await fetchMemberPeerScoreDetail(memberId, { ...filters, page: lastPage })
    }
  } catch (error) {
    unstable_rethrow(error)
    console.error("[MemberPeerScoreDetailPage]", error instanceof Error ? error.message : "Unknown error")
    result = { status: "error" }
  }
  if (result.status === "not_found") notFound()
  return <div>
    <AdminTopBar admin={admin} title="成员合拍分数详情" />
    {result.status === "ready" ? <MemberPeerScoreDetail data={result.data} /> : <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <Link href="/admin/peer-scores" className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline">返回合拍分数名单</Link>
      <section role={result.status === "error" ? "alert" : "status"} className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold">{result.status === "error" ? "详情暂时读取失败" : "详情功能尚未配置"}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{result.status === "error" ? "暂时无法确认该成员的评价记录，请重试。这不表示该成员没有评分。" : "待数据库功能就绪后可查看成员评分详情。"}</p>
        <Link href={memberPeerScoreDetailHref(memberId, filters)} className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-primary/10 px-4 text-sm font-medium text-primary">重新读取</Link>
      </section>
    </div>}
  </div>
}
