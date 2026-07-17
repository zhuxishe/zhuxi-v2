import Link from "next/link"
import { notFound } from "next/navigation"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchAdminMemberProfileMetrics } from "@/lib/profile/queries"
import { fetchMemberDetail } from "@/lib/queries/members"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { MemberStatusBadge } from "@/components/admin/MemberStatusBadge"
import { MemberStatusActions } from "@/components/admin/MemberStatusActions"
import { MemberDetailCard } from "@/components/admin/MemberDetailCard"
import { MemberNumberEditor } from "@/components/admin/MemberNumberEditor"
import { MemberProfileMetricsCard } from "@/components/admin/MemberProfileMetricsCard"
import { MemberDeleteButton } from "@/components/admin/MemberDeleteButton"
import { Button } from "@/components/ui/button"
import { ClipboardList, Pencil } from "lucide-react"

interface Props {
  params: Promise<{ id: string }>
}

export default async function MemberDetailPage({ params }: Props) {
  const admin = await requireAdmin()
  const { id } = await params

  const [memberResult, profileMetricsResult] = await Promise.allSettled([
    fetchMemberDetail(id),
    fetchAdminMemberProfileMetrics(id),
  ])
  if (memberResult.status === "rejected") notFound()
  const member = memberResult.value
  const profileMetrics = profileMetricsResult.status === "fulfilled" ? profileMetricsResult.value : null
  if (profileMetricsResult.status === "rejected") {
    console.error("[MemberDetailPage] profile metrics unavailable", profileMetricsResult.reason)
  }

  const identity = member.member_identity
  const rawEvals = member.interview_evaluations
  const hasEval = Array.isArray(rawEvals) ? rawEvals.length > 0 : !!rawEvals

  return (
    <div>
      <AdminTopBar admin={admin} title="成员详情" />
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">{identity?.full_name ?? "未知"}</h2>
            <MemberStatusBadge status={member.status} />
          </div>
          <div className="flex gap-2">
            <Link href={`/admin/members/${id}/edit`}>
              <Button size="sm" variant="outline">
                <Pencil className="size-4 mr-1" />
                编辑信息
              </Button>
            </Link>
            <Link href={`/admin/members/${id}/interview`}>
              <Button size="sm">
                <ClipboardList className="size-4 mr-1" />
                {hasEval ? "编辑面试评估" : "面试评估"}
              </Button>
            </Link>
          </div>
        </div>

        {/* 审批操作 */}
        <div className="flex items-center gap-4">
          <MemberStatusActions memberId={id} currentStatus={member.status} />
          <MemberDeleteButton memberId={id} memberName={identity?.full_name ?? "未知"} />
        </div>

        <MemberNumberEditor
          memberId={member.id}
          memberNumber={member.member_number}
          canEdit={admin.role === "super_admin"}
        />

        {profileMetrics ? (
          <MemberProfileMetricsCard
            key={profileMetrics.updatedAt}
            metrics={profileMetrics}
            member={{
              id: member.id,
              email: member.email,
              fullName: identity?.full_name ?? "未知成员",
              nickname: identity?.nickname ?? null,
              schoolName: identity?.school_name ?? null,
            }}
          />
        ) : (
          <section role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
            <h3 className="font-semibold">运营指标暂时无法读取</h3>
            <p className="mt-1 text-sm leading-6">成员的基本信息、面试、补充资料和性格信息仍可正常查看。请确认个人主页数据迁移已应用后刷新本页。</p>
          </section>
        )}

        <MemberDetailCard member={member} identity={identity} />
      </div>
    </div>
  )
}
