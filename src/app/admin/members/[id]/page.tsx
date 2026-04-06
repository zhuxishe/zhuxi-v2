import Link from "next/link"
import { notFound } from "next/navigation"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchMemberDetail } from "@/lib/queries/members"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { MemberStatusBadge } from "@/components/admin/MemberStatusBadge"
import { MemberStatusActions } from "@/components/admin/MemberStatusActions"
import { MemberDetailCard } from "@/components/admin/MemberDetailCard"
import { Button } from "@/components/ui/button"
import { ClipboardList, Pencil } from "lucide-react"

interface Props {
  params: Promise<{ id: string }>
}

export default async function MemberDetailPage({ params }: Props) {
  const admin = await requireAdmin()
  const { id } = await params

  let member
  try {
    member = await fetchMemberDetail(id)
  } catch {
    notFound()
  }

  const identity = member.member_identity
  const evaluation = member.interview_evaluations

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
                {evaluation ? "编辑面试评估" : "面试评估"}
              </Button>
            </Link>
          </div>
        </div>

        {/* 审批操作 */}
        <MemberStatusActions memberId={id} currentStatus={member.status} />

        <MemberDetailCard member={member} identity={identity} />
      </div>
    </div>
  )
}
