import { createClient } from "@/lib/supabase/server"
import { isReviewUuid } from "@/lib/activity-reviews/validation"

type ReviewRpcClient = { rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }> }
export type MatchReviewRoute = { reviewSystem: "legacy" | "unified"; roundId: string | null; reviewed: boolean }

function missingReviewRpc(error: { code?: string; message: string }, name: string) {
  // An absent new endpoint is expected before the migration. A missing helper
  // inside an installed function, permission failure or outage is not legacy.
  return ["PGRST202", "42883"].includes(error.code ?? "") && error.message.includes(name)
}

export async function fetchMatchReviewRoute(matchResultId: string): Promise<MatchReviewRoute> {
  const client = await createClient()
  const name = "player_get_match_review_route"
  const { data, error } = await (client as unknown as ReviewRpcClient).rpc(name, { p_match_result_id: matchResultId })
  if (error) {
    if (missingReviewRpc(error, name)) return { reviewSystem: "legacy", roundId: null, reviewed: false }
    throw new Error("Unable to load matching review route", { cause: error })
  }
  const row = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {}
  if (!["legacy", "unified"].includes(String(row.review_system)) || typeof row.reviewed !== "boolean"
    || (row.round_id !== null && !isReviewUuid(row.round_id)) || (row.review_system === "unified" && !isReviewUuid(row.round_id))) {
    throw new Error("Invalid matching review route response")
  }
  return { reviewSystem: row.review_system as MatchReviewRoute["reviewSystem"], roundId: row.round_id as string | null, reviewed: row.reviewed }
}

async function unifiedReviewedMatchIds(client: ReviewRpcClient): Promise<string[]> {
  const name = "player_list_unified_reviewed_match_ids"
  const { data, error } = await client.rpc(name)
  if (error) {
    if (missingReviewRpc(error, name)) return []
    throw new Error("Unable to load unified matching review completion", { cause: error })
  }
  const ids = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>).match_ids : null
  if (!Array.isArray(ids) || !ids.every(isReviewUuid)) throw new Error("Invalid unified matching review completion response")
  return ids
}

/** 获取玩家已提交的 review 的 match_result_id 集合 */
export async function fetchReviewedMatchIds(memberId: string): Promise<Set<string>> {
  const supabase = await createClient()
  const [{ data, error }, unifiedIds] = await Promise.all([supabase
    .from("mutual_reviews")
    .select("match_result_id")
    .eq("reviewer_id", memberId)
    .not("match_result_id", "is", null), unifiedReviewedMatchIds(supabase as unknown as ReviewRpcClient)])
  if (error) throw new Error("Unable to load legacy matching review completion", { cause: error })

  // match_result_id 已通过 .not("match_result_id", "is", null) 过滤，断言安全
  return new Set([...(data ?? []).map((r) => r.match_result_id!), ...unifiedIds])
}

/** 检查某个 match_result 是否已被该 reviewer 评价 */
export async function checkReviewExists(matchResultId: string, reviewerId: string, knownRoute?: MatchReviewRoute): Promise<boolean> {
  const route = knownRoute ?? await fetchMatchReviewRoute(matchResultId)
  if (route.reviewSystem === "unified") return route.reviewed
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("mutual_reviews")
    .select("id")
    .eq("match_result_id", matchResultId)
    .eq("reviewer_id", reviewerId)
    .maybeSingle()
  if (error) throw new Error("Unable to load legacy matching review", { cause: error })
  return !!data
}
