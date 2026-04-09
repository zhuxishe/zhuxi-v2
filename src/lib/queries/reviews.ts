import { createClient } from "@/lib/supabase/server"

/** 获取玩家已提交的 review 的 match_result_id 集合 */
export async function fetchReviewedMatchIds(memberId: string): Promise<Set<string>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("mutual_reviews")
    .select("match_result_id")
    .eq("reviewer_id", memberId)
    .not("match_result_id", "is", null)

  // match_result_id 已通过 .not("match_result_id", "is", null) 过滤，断言安全
  return new Set((data ?? []).map((r) => r.match_result_id!))
}

/** 检查某个 match_result 是否已被该 reviewer 评价 */
export async function checkReviewExists(matchResultId: string, reviewerId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("mutual_reviews")
    .select("id")
    .eq("match_result_id", matchResultId)
    .eq("reviewer_id", reviewerId)
    .maybeSingle()

  return !!data
}
