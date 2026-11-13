import { createClient } from "@/lib/supabase/server"
import { MemberCenterRpcError } from "./member-center"
import type { InterviewQuestionnaire } from "@/types/interview-questionnaire"

export async function fetchInterviewQuestionnaire(memberId: string): Promise<InterviewQuestionnaire> {
  const client = await createClient()
  const { data, error } = await client.rpc("admin_get_interview_questionnaire", { p_member_id: memberId })
  if (error) throw new MemberCenterRpcError("admin_get_interview_questionnaire", error)
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid interview questionnaire response")
  }
  if (data.status === "missing" || data.status === "draft" || data.status === "unavailable") {
    return { status: data.status }
  }
  if ((data.status !== "submitted" && data.status !== "legacy") || !data.template || !data.answers) {
    throw new Error("Invalid interview questionnaire response")
  }
  return data as unknown as InterviewQuestionnaire
}
