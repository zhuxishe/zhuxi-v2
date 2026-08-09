import Link from "next/link"
import { ShieldCheck } from "lucide-react"
import { CommunityStatusBadge } from "./CommunityStatusBadge"
import { COMMUNITY_ADMIN_INPUT_CLASS, formatAdminDate } from "./community-admin-ui"
import type { CommunityReport } from "./types"

export const REPORT_REASON_LABELS: Record<CommunityReport["reason"], string> = {
  harassment: "骚扰或攻击",
  privacy: "隐私或肖像问题",
  spam: "垃圾内容",
  inappropriate: "不适当内容",
  other: "其他",
}

const TARGET_LABELS: Record<CommunityReport["target_type"], string> = {
  post: "帖子／照片",
  comment: "评论／回复",
  profile: "社区身份",
}

export function ModerationFilters({ values }: { values: Record<string, string | undefined> }) {
  return (
    <form className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-6">
      <select name="status" defaultValue={values.status ?? "pending"} aria-label="处理状态" className={COMMUNITY_ADMIN_INPUT_CLASS}>
        <option value="">全部状态</option>
        <option value="pending">待处理</option>
        <option value="resolved">已处理</option>
        <option value="dismissed">已驳回</option>
      </select>
      <select name="reason" defaultValue={values.reason ?? ""} aria-label="举报原因" className={COMMUNITY_ADMIN_INPUT_CLASS}>
        <option value="">全部原因</option>
        {Object.entries(REPORT_REASON_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <select name="targetType" defaultValue={values.targetType ?? ""} aria-label="内容类型" className={COMMUNITY_ADMIN_INPUT_CLASS}>
        <option value="">全部类型</option>
        <option value="treehole">树洞</option>
        <option value="photo">照片动态</option>
        <option value="comment">评论</option>
        <option value="reply">回复</option>
        <option value="profile">社区身份</option>
      </select>
      <input name="reporter" defaultValue={values.reporter ?? ""} placeholder="举报人会员编号" aria-label="举报人会员编号" className={COMMUNITY_ADMIN_INPUT_CLASS} />
      <div className="grid grid-cols-2 gap-2 xl:col-span-2">
        <input name="from" type="date" defaultValue={values.from ?? ""} aria-label="开始日期" className={COMMUNITY_ADMIN_INPUT_CLASS} />
        <input name="to" type="date" defaultValue={values.to ?? ""} aria-label="结束日期" className={COMMUNITY_ADMIN_INPUT_CLASS} />
      </div>
      <div className="flex gap-2 sm:col-span-2 xl:col-span-6 xl:justify-end">
        <Link href="/admin/community/moderation" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">重置</Link>
        <button type="submit" className="inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">应用筛选</button>
      </div>
    </form>
  )
}

export function ModerationQueue({ reports }: { reports: CommunityReport[] }) {
  if (reports.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-4 py-14 text-center">
        <ShieldCheck className="mx-auto size-9 text-muted-foreground" />
        <p className="mt-3 font-medium">没有符合条件的举报</p>
        <p className="mt-1 text-sm text-muted-foreground">可以调整筛选条件查看其他记录。</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3 md:hidden">
        {reports.map((report) => (
          <Link key={report.id} href={`/admin/community/moderation/${report.id}`} className="block rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/30">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-primary">{TARGET_LABELS[report.target_type]}</p>
                <h3 className="mt-1 truncate font-semibold">{report.target_title}</h3>
              </div>
              <CommunityStatusBadge status={report.status} />
            </div>
            {report.target_excerpt ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{report.target_excerpt}</p> : null}
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div><dt>原因</dt><dd className="mt-0.5 font-medium text-foreground">{REPORT_REASON_LABELS[report.reason]}</dd></div>
              <div><dt>举报人</dt><dd className="mt-0.5 font-medium text-foreground">{report.reporter_number ?? "未编号"}</dd></div>
              <div className="col-span-2"><dt>提交时间</dt><dd className="mt-0.5 font-medium text-foreground">{formatAdminDate(report.created_at)}</dd></div>
            </dl>
          </Link>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">内容</th>
              <th className="px-4 py-3 font-medium">原因</th>
              <th className="px-4 py-3 font-medium">举报人</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">提交时间</th>
              <th className="px-4 py-3"><span className="sr-only">操作</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {reports.map((report) => (
              <tr key={report.id} className="hover:bg-muted/30">
                <td className="max-w-sm px-4 py-3">
                  <p className="text-xs text-primary">{TARGET_LABELS[report.target_type]}</p>
                  <p className="mt-1 truncate font-medium">{report.target_title}</p>
                  {report.target_excerpt ? <p className="mt-1 truncate text-xs text-muted-foreground">{report.target_excerpt}</p> : null}
                </td>
                <td className="px-4 py-3">{REPORT_REASON_LABELS[report.reason]}</td>
                <td className="px-4 py-3">{report.reporter_number ?? "未编号"}</td>
                <td className="px-4 py-3"><CommunityStatusBadge status={report.status} /></td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatAdminDate(report.created_at)}</td>
                <td className="px-4 py-3 text-right"><Link href={`/admin/community/moderation/${report.id}`} className="font-medium text-primary hover:underline">查看</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
