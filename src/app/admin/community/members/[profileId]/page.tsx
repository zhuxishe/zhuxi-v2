import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { requireAdmin } from "@/lib/auth/admin"
import { CommunityAdminPage } from "@/components/admin/community/CommunityAdminPage"
import { CommunityMemberDetail } from "@/components/admin/community/CommunityMemberDetail"
import { CommunitySetupWarning } from "@/components/admin/community/CommunitySetupWarning"
import { fetchCommunityAdminMember } from "../../data"

interface PageProps {
  params: Promise<{ profileId: string }>
}

export default async function AdminCommunityMemberDetailPage({ params }: PageProps) {
  const { profileId } = await params
  const admin = await requireAdmin()
  const result = await fetchCommunityAdminMember(profileId)
  if (!result.setupRequired && !result.member) notFound()

  return (
    <CommunityAdminPage
      admin={admin}
      title="社区成员详情"
      description="查看社区活动、昵称变更和处罚历史，并按权限执行限制。"
      actions={<Link href="/admin/community/members" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted"><ArrowLeft className="size-4" /> 返回成员列表</Link>}
    >
      {result.setupRequired ? <CommunitySetupWarning /> : result.member ? <CommunityMemberDetail member={result.member} adminRole={admin.role} /> : null}
    </CommunityAdminPage>
  )
}
