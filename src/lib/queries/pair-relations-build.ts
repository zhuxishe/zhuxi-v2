/**
 * 构建匹配算法所需的 pairRelations
 *
 * 从 pair_relationships（黑名单）+ mutual_reviews（互评）+ match_results（配对历史）
 * 构建 buildPairRelations 所需的三个参数，返回 Map<string, PairRelation>
 *
 * 注意：buildPairRelations / getPairStatus 使用 MatchCandidate.name（full_name）
 * 作为 key，所以这里需要 idToName 映射来将 UUID 转为名字
 */

import { createClient } from "@/lib/supabase/server"
import { buildPairRelations } from "@/lib/matching/pair-history"
import type { PairRelation, FeedbackRecord, BlacklistRecord } from "@/lib/matching/pair-history"
import { fetchMatchHistory } from "./matching"

/**
 * 为一组候选成员构建配对关系 Map
 * @param memberIds 参与匹配的成员 ID 列表
 * @param idToName memberId → MatchCandidate.name 的映射
 * @returns Map<string, PairRelation> 供匹配算法使用
 */
export async function fetchPairRelations(
  memberIds: string[],
  idToName: Map<string, string>,
): Promise<Map<string, PairRelation>> {
  if (memberIds.length === 0) return new Map()

  const [blacklist, feedbacks, rawHistory] = await Promise.all([
    fetchBlacklist(memberIds, idToName),
    fetchFeedbacks(memberIds, idToName),
    fetchMatchHistory(memberIds),
  ])

  // 将 matchHistory 的 key/name 从 memberId 转为 name
  const matchHistories = remapHistory(rawHistory, idToName)

  return buildPairRelations(feedbacks, blacklist, matchHistories)
}

/** 从 pair_relationships 表查 status='blacklist' 的记录 */
async function fetchBlacklist(
  memberIds: string[],
  idToName: Map<string, string>,
): Promise<BlacklistRecord[]> {
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
        const nameA = idToName.get(row.member_a_id)
        const nameB = idToName.get(row.member_b_id)
        if (!nameA || !nameB) continue // 未知成员跳过
        results.push({
          player_a: nameA,
          player_b: nameB,
          reason: row.notes,
          source: "pair_relationships",
        })
      }
    }
  }

  return deduplicateBlacklist(results)
}

/** 从 mutual_reviews 表查互评 → 转为 FeedbackRecord */
async function fetchFeedbacks(
  memberIds: string[],
  idToName: Map<string, string>,
): Promise<FeedbackRecord[]> {
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

        const reviewerName = idToName.get(row.reviewer_id)
        const revieweeName = idToName.get(row.reviewee_id)
        if (!reviewerName || !revieweeName) continue

        results.push({
          player_name: reviewerName,
          partner_name: revieweeName,
          partner_rating: row.overall_score,
          session_number: 1,
        })
      }
    }
  }

  return results
}

/** 将 matchHistory 的 memberId key/name 转为 full_name */
function remapHistory(
  raw: Map<string, { name: string; count: number }[]>,
  idToName: Map<string, string>,
): Map<string, { name: string; count: number }[]> {
  const result = new Map<string, { name: string; count: number }[]>()
  for (const [memberId, partners] of raw) {
    const playerName = idToName.get(memberId)
    if (!playerName) continue
    const mapped: { name: string; count: number }[] = []
    for (const p of partners) {
      const partnerName = idToName.get(p.name)
      if (partnerName) mapped.push({ name: partnerName, count: p.count })
    }
    result.set(playerName, mapped)
  }
  return result
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
