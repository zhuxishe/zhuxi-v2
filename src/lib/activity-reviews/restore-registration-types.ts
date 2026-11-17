import type { ActivityReviewActionResult } from "./types"

export interface RestoreReviewRegistrationInput {
  roundId: string
  memberId: string
  reason: string
}

export type RestoreReviewRegistrationAction = (input: RestoreReviewRegistrationInput) => Promise<ActivityReviewActionResult>
