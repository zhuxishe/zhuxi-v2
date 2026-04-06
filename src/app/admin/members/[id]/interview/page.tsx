import { notFound } from "next/navigation"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchMemberDetail } from "@/lib/queries/members"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { InterviewEvalForm } from "@/components/admin/InterviewEvalForm"

interface Props {
  params: Promise<{ id: string }>
}

export default async function InterviewEvalPage({ params }: Props) {
  const admin = await requireAdmin()
  const { id } = await params

  let member
  try {
    member = await fetchMemberDetail(id)
  } catch {
    notFound()
  }

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
