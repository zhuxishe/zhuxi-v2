import { notFound } from "next/navigation"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchMember360, isMemberNotFoundError, member360ToLegacyDetail } from "@/lib/queries/member-center"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { InterviewEvalForm } from "@/components/admin/InterviewEvalForm"
import { fetchMemberCompositeScores } from "@/lib/queries/member-composite-scores"
import { fetchInterviewQuestionnaire } from "@/lib/queries/interview-questionnaire"
import { InterviewQuestionnairePanel } from "@/components/admin/InterviewQuestionnairePanel"

interface Props {
  params: Promise<{ id: string }>
}

export default async function InterviewEvalPage({ params }: Props) {
  const admin = await requireAdmin()
  const { id } = await params

  let member360
  let compositeScores
  let questionnaire
  try {
    ;[member360, compositeScores, questionnaire] = await Promise.all([
      fetchMember360(id),
      fetchMemberCompositeScores(id),
      fetchInterviewQuestionnaire(id).catch((error) => {
        console.error("[InterviewEvalPage] questionnaire load failed", error)
        return null
      }),
    ])
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
      <div className="grid items-start gap-6 p-4 sm:p-6 xl:grid-cols-2">
        <div className="min-w-0 xl:sticky xl:top-6 xl:max-h-[calc(100dvh-3rem)] xl:overflow-y-auto xl:p-1">
          <InterviewQuestionnairePanel questionnaire={questionnaire} />
        </div>
        <div className="min-w-0">
          <InterviewEvalForm
            memberId={id}
            memberName={identity?.full_name ?? "未知"}
            adminName={admin.name}
            existing={myEval}
            compositeScores={compositeScores}
          />
        </div>
      </div>
    </div>
  )
}
