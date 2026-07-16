import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { requireAdmin } from "@/lib/auth/admin"
import { CommunityAdminPage } from "@/components/admin/community/CommunityAdminPage"
import { CommunitySetupWarning } from "@/components/admin/community/CommunitySetupWarning"
import { ModerationReportDetail } from "@/components/admin/community/ModerationReportDetail"
import { fetchCommunityReportDetail } from "../../data"

interface PageProps {
  params: Promise<{ reportId: string }>
}

export default async function AdminCommunityModerationDetailPage({ params }: PageProps) {
  const { reportId } = await params
  const admin = await requireAdmin()
  const result = await fetchCommunityReportDetail(reportId)
  if (!result.setupRequired && !result.report) notFound()

  return (
    <CommunityAdminPage
      admin={admin}
      title="举报详情"
      description="查看原始内容、举报说明、处理历史，并执行内容处理或会员限制。"
      actions={
        <Link href="/admin/community/moderation" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted">
          <ArrowLeft className="size-4" /> 返回审核队列
        </Link>
      }
    >
      {result.setupRequired ? <CommunitySetupWarning /> : result.report ? <ModerationReportDetail report={result.report} adminRole={admin.role} /> : null}
    </CommunityAdminPage>
  )
}
