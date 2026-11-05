import { isReviewUuid, validReviewReason } from "./validation"

export const REVIEW_REQUIREMENT_STATES = ["pending", "completed", "exempt", "no_target", "unavailable", "not_ended"] as const
export type ReviewRequirementState = typeof REVIEW_REQUIREMENT_STATES[number]

export interface ReviewRequirementParticipant {
  memberId: string
  fullName: string
  nickname: string | null
  state: ReviewRequirementState
  exempt: boolean
  exemptionVersion: number
  exemptionReason: string | null
}

export interface AdminReviewRequirements {
  required: boolean
  endedAt: string | null
  participants: ReviewRequirementParticipant[]
}

export type AdminReviewRequirementsResult =
  | { status: "ready"; data: AdminReviewRequirements }
  | { status: "unavailable" | "failed" }

export interface SetReviewExemptionInput {
  roundId: string
  memberId: string
  exempt: boolean
  expectedVersion: number
  reason: string
}

export function validateReviewExemption(input: SetReviewExemptionInput): string | null {
  if (!input || !isReviewUuid(input.roundId) || !isReviewUuid(input.memberId)
    || typeof input.exempt !== "boolean" || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) return "PEER_INVALID_INPUT"
  return validReviewReason(input.reason) ? null : "PEER_REASON_REQUIRED"
}
