import { requireAdmin } from "@/lib/auth/admin"
import { createClient } from "@/lib/supabase/server"
import { validateUuids } from "@/lib/sanitize"
import type { MatchingRunRecord } from "@/lib/matching/run-lifecycle"

interface MatchingRunsRpcClient {
  rpc(name: "admin_list_round_matching_runs", args: { p_round_id: string }): PromiseLike<{
    data: unknown
    error: unknown
  }>
}

/** Authenticated RPC exposes only safe batch metadata, never the input snapshot. */
export async function fetchRoundMatchingRuns(roundId: string): Promise<MatchingRunRecord[]> {
  validateUuids([roundId])
  await requireAdmin()
  const db = await createClient() as unknown as MatchingRunsRpcClient
  const { data, error } = await db.rpc("admin_list_round_matching_runs", { p_round_id: roundId })
  if (error) throw new Error("暂时无法读取本轮运行记录，请刷新后重试")
  if (!Array.isArray(data)) throw new Error("本轮运行记录格式异常")
  return data as unknown as MatchingRunRecord[]
}
