/**
 * 配对关系构建 — 从历史数据生成关系 Map
 */

import type {
  PairStatus,
  PairRelation,
  FeedbackRecord,
  BlacklistRecord,
} from "./pair-history"
import { pairKey, sortedPair } from "./pair-history"

/**
 * 从历史数据构建所有配对关系
 */
export function buildPairRelations(
  feedbacks: FeedbackRecord[],
  blacklist: BlacklistRecord[],
  matchHistories: Map<string, { name: string; count: number }[]>,
): Map<string, PairRelation> {
  const relations = new Map<string, PairRelation>()

  // 1. 处理黑名单（最高优先级）
  for (const bl of blacklist) {
    const key = pairKey(bl.player_a, bl.player_b)
    relations.set(key, {
      playerA: sortedPair(bl.player_a, bl.player_b)[0],
      playerB: sortedPair(bl.player_a, bl.player_b)[1],
      status: "blacklist",
      totalPairCount: 0,
      hasMutualFive: false,
      reason: bl.reason || `黑名单(${bl.source})`,
    })
  }

  // 2. 从 feedbacks 找出所有配对 + 双五分
  const pairFeedbacks = groupFeedbacksByPair(feedbacks)

  // 3. 从 matchHistory 补充配对次数
  const pairCounts = buildPairCounts(matchHistories)

  // 4. 合并构建关系
  const allPairKeys = new Set([...pairFeedbacks.keys(), ...pairCounts.keys()])

  for (const key of allPairKeys) {
    if (relations.has(key)) continue

    const fb = pairFeedbacks.get(key)
    const histCount = pairCounts.get(key) || 0
    const feedbackCount = fb ? Math.ceil(fb.count / 2) : 0
    const totalPairCount = Math.max(histCount, feedbackCount)

    const hasMutualFive = fb != null && fb.aRatesB === 5 && fb.bRatesA === 5

    // 1分评价 → 自动黑名单
    if (fb && (fb.aRatesB === 1 || fb.bRatesA === 1)) {
      const [a, b] = key.split("||")
      relations.set(key, {
        playerA: a, playerB: b,
        status: "blacklist",
        totalPairCount,
        hasMutualFive: false,
        reason: `历史评分1分(自动黑名单)`,
      })
      continue
    }

    const { status, reason } = determinePairStatus(hasMutualFive, totalPairCount)
    const [a, b] = key.split("||")
    relations.set(key, { playerA: a, playerB: b, status, totalPairCount, hasMutualFive, reason })
  }

  return relations
}

function groupFeedbacksByPair(feedbacks: FeedbackRecord[]) {
  const map = new Map<string, { aRatesB: number | null; bRatesA: number | null; count: number }>()

  for (const fb of feedbacks) {
    const key = pairKey(fb.player_name, fb.partner_name)
    if (!map.has(key)) {
      map.set(key, { aRatesB: null, bRatesA: null, count: 0 })
    }
    const entry = map.get(key)!
    const [sortedA] = sortedPair(fb.player_name, fb.partner_name)
    if (fb.player_name === sortedA) {
      entry.aRatesB = fb.partner_rating
    } else {
      entry.bRatesA = fb.partner_rating
    }
    entry.count++
  }

  return map
}

function buildPairCounts(matchHistories: Map<string, { name: string; count: number }[]>) {
  const counts = new Map<string, number>()
  for (const [playerName, history] of matchHistories) {
    for (const h of history) {
      const key = pairKey(playerName, h.name)
      counts.set(key, Math.max(counts.get(key) || 0, h.count))
    }
  }
  return counts
}

function determinePairStatus(
  hasMutualFive: boolean,
  totalPairCount: number,
): { status: PairStatus; reason: string } {
  if (hasMutualFive) {
    if (totalPairCount === 1) {
      return { status: "cooldown", reason: `双五分后冷却期(已配${totalPairCount}次)` }
    } else if (totalPairCount === 2) {
      return { status: "reunion", reason: `双五分重逢(已配${totalPairCount}次)` }
    } else {
      return { status: "normal", reason: `双五分已完成重逢周期(已配${totalPairCount}次)` }
    }
  }

  return { status: "avoid", reason: `历史配对${totalPairCount}次，非双五分` }
}
