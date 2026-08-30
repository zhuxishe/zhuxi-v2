import Link from "next/link"
import { Camera, EyeOff, MessageSquareText, ShieldAlert, UserRoundX } from "lucide-react"
import { requireAdmin } from "@/lib/auth/admin"
import { CommunityAdminPage } from "@/components/admin/community/CommunityAdminPage"
import { CommunityMetricCard } from "@/components/admin/community/CommunityMetricCard"
import { CommunitySetupWarning } from "@/components/admin/community/CommunitySetupWarning"
import { CommunityStatusBadge } from "@/components/admin/community/CommunityStatusBadge"
import { formatAdminDate, formatProtectedMemberNumber } from "@/components/admin/community/community-admin-ui"
import { fetchCommunityOverview } from "./data"

export default async function AdminCommunityPage() {
  const admin = await requireAdmin()
  const canViewMemberNumber = admin.role === "super_admin"
  const overview = await fetchCommunityOverview()

  return (
    <CommunityAdminPage
      admin={admin}
      title="社区概览"
      description="查看社区内容、审核队列和当前限制状态。数据按日本时间统计。"
    >
      {overview.setupRequired ? (
        <CommunitySetupWarning />
      ) : (
        <>
          <section aria-label="社区关键数据" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <CommunityMetricCard icon={ShieldAlert} label="待处理举报" value={overview.metrics.pendingReports} tone="danger" />
            <CommunityMetricCard icon={MessageSquareText} label="今日新增树洞" value={overview.metrics.todayTreeholes} />
            <CommunityMetricCard icon={Camera} label="今日新增照片" value={overview.metrics.todayPhotos} />
            <CommunityMetricCard icon={EyeOff} label="被隐藏内容" value={overview.metrics.hiddenContent} tone="warning" />
            <CommunityMetricCard icon={UserRoundX} label="临时禁言会员" value={overview.metrics.activeMutes} tone="warning" />
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
              <div>
                <h3 className="font-semibold text-foreground">最早待处理举报</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">优先处理等待时间最长的内容</p>
              </div>
              <Link href="/admin/community/moderation?status=pending" className="text-sm font-medium text-primary hover:underline">
                查看全部
              </Link>
            </div>
            {overview.recentReports.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">当前没有待处理举报</p>
            ) : (
              <div className="divide-y divide-border">
                {overview.recentReports.map((report) => (
                  <Link
                    key={report.id}
                    href={`/admin/community/moderation/${report.id}`}
                    className="flex min-h-14 items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/60"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-foreground">{report.target_title}</p>
                        <CommunityStatusBadge status={report.status} />
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        举报原因：{report.reason} · 举报人 {formatProtectedMemberNumber(report.reporter_number, canViewMemberNumber)}
                      </p>
                    </div>
                    <time className="shrink-0 text-xs text-muted-foreground">{formatAdminDate(report.created_at)}</time>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </CommunityAdminPage>
  )
}
