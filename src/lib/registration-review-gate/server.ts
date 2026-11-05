import { createClient } from "@/lib/supabase/server"
import { parseRegistrationReviewGate, REVIEW_GATE_UUID } from "./types"

type RegistrationReviewClient = {
  rpc(name: "player_get_registration_review_gate", args: { p_round_id: string }):
    PromiseLike<{ data: unknown; error: unknown }>
}

/** The RPC authenticates the player; callers cannot supply another member's identity. */
export async function fetchRegistrationReviewGate(roundId: string) {
  if (!REVIEW_GATE_UUID.test(roundId)) throw new Error("Invalid registration target")
  const client = await createClient()
  const { data, error } = await (client as unknown as RegistrationReviewClient)
    .rpc("player_get_registration_review_gate", { p_round_id: roundId })
  if (error) throw new Error("Unable to check registration reviews", { cause: error })
  // Deliberately uncached: completing a review in another tab unlocks the next attempt.
  return parseRegistrationReviewGate(data)
}
