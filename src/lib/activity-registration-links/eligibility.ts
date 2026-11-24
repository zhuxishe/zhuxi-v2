import type { RoundRecord } from "@/types"

export function isLinkableSignupRound(round: Pick<RoundRecord, "purpose" | "status" | "is_test" | "deleted_at">) {
  return (round.purpose === "registration" || round.purpose === "matching")
    && (round.status === "open" || round.status === "closed" || round.status === "matched")
    && !round.is_test
    && !round.deleted_at
}
