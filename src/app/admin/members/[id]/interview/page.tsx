import { notFound } from "next/navigation"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchMember360, isMemberNotFoundError, member360ToLegacyDetail } from "@/lib/queries/member-center"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { InterviewEvalForm } from "@/components/admin/InterviewEvalForm"

interface Props {
  params: Promise<{ id: string }>
}

export default async function InterviewEvalPage({ params }: Props) {
  const admin = await requireAdmin()
  const { id } = await params

  let member360
  try {
    member360 = await fetchMember360(id)
  } catch (error) {
    if (isMemberNotFoundError(error)) notFound()
    throw error
  }
  const member = member360ToLegacyDetail(member360)

  const identity = member.member_identity
  // 1:N — 取当前管理员已有的评估
  const evals = Array.isArray(member.interview_evaluations)
    ? member.interview_evaluations
    : member.interview_evaluations ? [member.interview_evaluations] : []
  const myEval = evals.find((e: { interviewer_id: string }) => e.interviewer_id === admin.id)

  return (
    <div>
      <AdminTopBar admin={admin} title="面试评估" />
      <div className="p-6">
        <InterviewEvalForm
          memberId={id}
          memberName={identity?.full_name ?? "未知"}
          adminName={admin.name}
          existing={myEval}
        />
      </div>
    </div>
  )
}
