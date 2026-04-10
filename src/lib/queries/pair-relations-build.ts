/**
 * 构建匹配算法所需的 pairRelations
 *
 * 从 pair_relationships（黑名单）+ mutual_reviews（互评）+ match_results（配对历史）
 * 构建 buildPairRelations 所需的三个参数，返回 Map<string, PairRelation>
 *
 * 全链路使用 member UUID 作为 key（不再转名字，避免同名冲突）
 */

import { createClient } from "@/lib/supabase/server"
import { buildPairRelations } from "@/lib/matching/pair-history"
import type { PairRelation, FeedbackRecord, BlacklistRecord } from "@/lib/matching/pair-history"
import { validateUuids } from "@/lib/sanitize"
import { fetchMatchHistory } from "./match-history"

/**
 * 为一组候选成员构建配对关系 Map
 * @param memberIds 参与匹配的成员 ID 列表
 * @returns Map<string, PairRelation> 供匹配算法使用
 */
export async function fetchPairRelations(
  memberIds: string[],
): Promise<Map<string, PairRelation>> {
  if (memberIds.length === 0) return new Map()

  validateUuids(memberIds)

  const [blacklist, feedbacks, matchHistories] = await Promise.all([
    fetchBlacklist(memberIds),
    fetchFeedbacks(memberIds),
    fetchMatchHistory(memberIds),
  ])

  return buildPairRelations(feedbacks, blacklist, matchHistories)
}

/** 从 pair_relationships 表查 status='blacklist' 的记录 */
async function fetchBlacklist(memberIds: string[]): Promise<BlacklistRecord[]> {
  const supabase = await createClient()
  const batchSize = 50
  const results: BlacklistRecord[] = []

  for (let i = 0; i < memberIds.length; i += batchSize) {
    const idList = memberIds.slice(i, i + batchSize).join(",")
    const { data, error } = await supabase
      .from("pair_relationships")
      .select("member_a_id, member_b_id, notes, status")
      .eq("status", "blacklist")
      .or(`member_a_id.in.(${idList}),member_b_id.in.(${idList})`)

    if (error) throw error
    if (data) {
      for (const row of data) {
        results.push({
          player_a: row.member_a_id,
          player_b: row.member_b_id,
          reason: row.notes,
          source: "pair_relationships",
        })
      }
    }
  }

  return deduplicateBlacklist(results)
}

/** 从 mutual_reviews 表查互评 → 转为 FeedbackRecord（用 member UUID） */
async function fetchFeedbacks(memberIds: string[]): Promise<FeedbackRecord[]> {
  const supabase = await createClient()
  const batchSize = 50
  const results: FeedbackRecord[] = []
  const seen = new Set<string>()

  for (let i = 0; i < memberIds.length; i += batchSize) {
    const idList = memberIds.slice(i, i + batchSize).join(",")
    const { data, error } = await supabase
      .from("mutual_reviews")
      .select("reviewer_id, reviewee_id, overall_score")
      .or(`reviewer_id.in.(${idList}),reviewee_id.in.(${idList})`)

    if (error) throw error
    if (data) {
      for (const row of data) {
        const key = `${row.reviewer_id}-${row.reviewee_id}`
        if (seen.has(key)) continue
        seen.add(key)

        results.push({
          player_name: row.reviewer_id,
          partner_name: row.reviewee_id,
          partner_rating: row.overall_score,
          session_number: 1,
        })
      }
    }
  }

  return results
}

/** 去重黑名单（同对 A-B 可能被不同 batch 查出） */
function deduplicateBlacklist(records: BlacklistRecord[]): BlacklistRecord[] {
  const seen = new Set<string>()
  return records.filter((r) => {
    const key = [r.player_a, r.player_b].sort().join("||")
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
