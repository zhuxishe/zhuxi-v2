import Link from "next/link"
import { formatAdminDateTime } from "@/lib/admin-datetime"
import { PEER_NO_MATCH_STATUS_LABELS, type AdminPeerNoMatchRequestsResult, type PeerNoMatchRequestFilter, type ResolvePeerNoMatchRequestAction } from "@/lib/peer-no-match/admin-types"
import { NoMatchRequestFilters } from "./NoMatchRequestFilters"
import { NoMatchResolutionForm } from "./NoMatchResolutionForm"

export function NoMatchRequestsList({ result, status, action }: {
  result: AdminPeerNoMatchRequestsResult | { status: "error" }
  status: PeerNoMatchRequestFilter
  action: ResolvePeerNoMatchRequestAction
}) {
  const data = result.status === "ready" ? result.data : null
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const pageHref = (page: number) => `/admin/matching/avoidance-requests?${new URLSearchParams({ status, ...(page > 1 ? { page: String(page) } : {}) })}`
  return <main className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
    <div className="space-y-2 text-sm leading-6 text-muted-foreground">
      <p>不再配对申请由工作人员人工处理，与评分和举报分别记录。这里只更新申请状态，不会自动禁止系统再次匹配。</p>
      <p>请在人工编排中落实安排，并记录实际采取的措施；如需使用已有禁配管理，可另行前往<Link href="/admin/matching/blacklist" className="font-medium text-primary underline underline-offset-4">配对黑名单</Link>。</p>
      <p className="text-xs">玩家端只向申请人展示自己的申请和处理状态，不向对方展示。内部处理说明和操作理由仅工作人员可见。</p>
    </div>
    <NoMatchRequestFilters status={status} />
    {result.status === "unavailable" ? <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">拒配申请管理暂未配置，待后台数据功能就绪后可查看。</p> : null}
    {result.status === "error" ? <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">申请记录读取失败，请稍后刷新；这不表示没有待处理申请。</p> : null}
    {data ? <>
      <p className="text-sm text-muted-foreground">共 {data.total} 条申请</p>
      {data.requests.length ? <div className="space-y-3">{data.requests.map((request) => <article key={`${request.id}:${request.version}`} className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><h2 className="break-words text-sm font-semibold"><Link href={`/admin/members/${request.requesterId}`} className="text-primary hover:underline">{request.requesterName || "未填写姓名"}</Link><span className="mx-2 font-normal text-muted-foreground">申请不再配对</span><Link href={`/admin/members/${request.targetMemberId}`} className="text-primary hover:underline">{request.targetName || "未填写姓名"}</Link></h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{request.roundName || "未命名活动"} · 申请于 {formatAdminDateTime(request.createdAt)}</p></div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${request.status === "pending" ? "bg-amber-50 text-amber-800" : "bg-muted text-muted-foreground"}`}>{PEER_NO_MATCH_STATUS_LABELS[request.status]}</span>
        </div>
        <details className="mt-3">
          <summary className="min-h-8 cursor-pointer text-sm font-medium text-primary">{request.status === "pending" ? "查看申请并处理" : "查看申请与处理记录"}</summary>
          <div className="mt-3 space-y-4">
            <div className="rounded-lg bg-muted/25 p-3"><h3 className="text-xs font-medium text-muted-foreground">申请人说明</h3><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{request.reason || "未填写说明"}</p></div>
            {request.status !== "pending" ? <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
              <h3 className="font-medium">工作人员处理记录</h3><p className="text-xs text-muted-foreground">{request.processedByName || "历史工作人员"} · {formatAdminDateTime(request.processedAt)}</p>
              <p className="whitespace-pre-wrap break-words leading-6"><span className="font-medium">内部处理说明：</span>{request.internalNote}</p>
              <p className="whitespace-pre-wrap break-words leading-6"><span className="font-medium">操作理由：</span>{request.processingReason}</p>
            </div> : <NoMatchResolutionForm request={request} action={action} />}
          </div>
        </details>
      </article>)}</div> : <p className="rounded-xl border border-dashed border-border bg-card py-12 text-center text-sm text-muted-foreground">当前状态下暂无申请</p>}
      {totalPages > 1 ? <nav aria-label="拒配申请分页" className="flex flex-wrap items-center justify-between gap-3 text-sm"><span className="text-muted-foreground">第 {data.page} / {totalPages} 页</span><div className="flex gap-2">{data.page > 1 ? <Link href={pageHref(data.page - 1)} className="inline-flex min-h-11 items-center rounded-lg border border-border px-3">上一页</Link> : null}{data.page < totalPages ? <Link href={pageHref(data.page + 1)} className="inline-flex min-h-11 items-center rounded-lg border border-border px-3">下一页</Link> : null}</div></nav> : null}
    </> : null}
  </main>
}
