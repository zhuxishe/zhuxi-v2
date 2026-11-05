import { requireAdmin } from "@/lib/auth/admin"
import { activityReviewErrorCode, activityReviewRpc } from "./queries"
import { isReviewUuid } from "./validation"
import { REVIEW_REQUIREMENT_STATES, type AdminReviewRequirements, type AdminReviewRequirementsResult, type ReviewRequirementParticipant, type ReviewRequirementState } from "./requirements"

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("PEER_INVALID_RESPONSE")
  return value as Record<string, unknown>
}

export function mapAdminReviewRequirements(value: unknown): AdminReviewRequirements {
  const data = object(value)
  if (typeof data.required !== "boolean" || !Array.isArray(data.participants)
    || !(data.ended_at === null || typeof data.ended_at === "string" && Number.isFinite(Date.parse(data.ended_at)))) throw new Error("PEER_INVALID_RESPONSE")
  const seen = new Set<string>()
  const participants = data.participants.map((item): ReviewRequirementParticipant => {
    const row = object(item)
    if (!isReviewUuid(row.member_id) || seen.has(row.member_id)
      || typeof row.full_name !== "string" || !(row.nickname === null || typeof row.nickname === "string")
      || !REVIEW_REQUIREMENT_STATES.includes(row.state as ReviewRequirementState) || typeof row.exempt !== "boolean"
      || !Number.isSafeInteger(row.exemption_version) || (row.exemption_version as number) < 0
      || !(row.exemption_reason === null || typeof row.exemption_reason === "string")) throw new Error("PEER_INVALID_RESPONSE")
    seen.add(row.member_id)
    return { memberId: row.member_id, fullName: row.full_name, nickname: row.nickname, state: row.state as ReviewRequirementState,
      exempt: row.exempt, exemptionVersion: row.exemption_version as number, exemptionReason: row.exemption_reason }
  })
  return { required: data.required, endedAt: data.ended_at, participants }
}

export async function fetchAdminReviewRequirements(roundId: string): Promise<AdminReviewRequirementsResult> {
  await requireAdmin()
  if (!isReviewUuid(roundId)) return { status: "failed" }
  try {
    const data = mapAdminReviewRequirements(await activityReviewRpc("admin_get_round_review_requirements", { p_round_id: roundId }))
    return { status: "ready", data }
  } catch (error) {
    return { status: activityReviewErrorCode(error) === "PEER_UNAVAILABLE" ? "unavailable" : "failed" }
  }
}
