import { createClient } from "@/lib/supabase/server"
import { normalizeMemberCompositeScores } from "@/lib/member-master/composite-scores"
import { MemberCenterRpcError } from "@/lib/queries/member-center"
import type { MemberCompositeScoreValues } from "@/types/member-composite-scores"

interface CompositeScoreRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{
    data: unknown
    error: { code?: string; message: string; details?: string; hint?: string } | null
  }>
}

async function compositeScoreRpc(name: string, args: Record<string, unknown>) {
  const client = await createClient() as unknown as CompositeScoreRpcClient
  const { data, error } = await client.rpc(name, args)
  if (error) throw new MemberCenterRpcError(name, error)
  return normalizeMemberCompositeScores(data)
}

export async function fetchMemberCompositeScores(memberId: string) {
  try {
    return await compositeScoreRpc("admin_get_member_composite_scores", { p_member_id: memberId })
  } catch (error) {
    // Closed or anonymized profiles remain readable in the member center, but
    // their assessment is intentionally unavailable.
    if (error instanceof MemberCenterRpcError && error.message.includes("COMPOSITE_SCORE_MEMBER_UNAVAILABLE")) return null
    throw error
  }
}

export async function updateMemberCompositeScores(input: {
  memberId: string
  scores: MemberCompositeScoreValues
  reason: string
  expectedUpdatedAt: string | null
}) {
  return compositeScoreRpc("admin_update_member_composite_scores", {
    p_member_id: input.memberId,
    p_scores: input.scores,
    p_reason: input.reason,
    p_expected_updated_at: input.expectedUpdatedAt,
  })
}
