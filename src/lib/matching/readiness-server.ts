import { createClient } from "@/lib/supabase/server"
import { parseMatchingReadiness, type MatchingReadiness } from "./profile-readiness"

type ReadinessClient = {
  rpc(name: "get_my_matching_readiness" | "get_member_matching_readiness", args?: { p_member_id: string }):
    PromiseLike<{ data: unknown; error: unknown }>
}

async function readReadiness(memberId?: string): Promise<MatchingReadiness> {
  const client = await createClient()
  const { data, error } = await (client as unknown as ReadinessClient).rpc(
    memberId === undefined ? "get_my_matching_readiness" : "get_member_matching_readiness",
    memberId === undefined ? undefined : { p_member_id: memberId },
  )
  if (error) throw new Error("Unable to check matching profile", { cause: error })
  return parseMatchingReadiness(data)
}

// The RPCs authenticate the caller, and only the admin RPC accepts a member ID.
// Deliberately uncached: saving a questionnaire must immediately unlock the next step.
export function fetchMyMatchingReadiness() { return readReadiness() }
export function fetchMemberMatchingReadiness(memberId: string) { return readReadiness(memberId) }
