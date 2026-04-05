/**
 * 配对关系管理 — 从历史数据构建配对关系
 *
 * 数据来源：
 * 1. legacy_feedbacks (Supabase) — 历史互评记录
 * 2. matchHistory (members_clean.json) — 配对次数
 * 3. round1_blacklist (Supabase) — 黑名单
 *
 * 配对状态：
 * - "blacklist"  → 硬约束：绝对不配
 * - "cooldown"   → 硬约束：双五分后第2次，必须跳过
 * - "reunion"    → 优先配对：双五分后第3次，加分优先
 * - "avoid"      → 尽量避免：非双五分重复配对
 * - "normal"     → 无历史或双五分3次后，正常处理
 */

export type PairStatus = "blacklist" | "cooldown" | "reunion" | "avoid" | "normal"

export interface PairRelation {
  playerA: string // 排序后 A < B
  playerB: string
  status: PairStatus
  totalPairCount: number
  hasMutualFive: boolean
  reason: string
}

export interface FeedbackRecord {
  player_name: string
  partner_name: string
  partner_rating: number | null
  session_number: number
}

export interface BlacklistRecord {
  player_a: string
  player_b: string
  reason: string | null
  source: string
}

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
  // 按配对分组
  const pairFeedbacks = new Map<string, { aRatesB: number | null; bRatesA: number | null; count: number }>()

  for (const fb of feedbacks) {
    const key = pairKey(fb.player_name, fb.partner_name)
    if (!pairFeedbacks.has(key)) {
      pairFeedbacks.set(key, { aRatesB: null, bRatesA: null, count: 0 })
    }
    const entry = pairFeedbacks.get(key)!
    const [sortedA] = sortedPair(fb.player_name, fb.partner_name)
    if (fb.player_name === sortedA) {
      entry.aRatesB = fb.partner_rating
    } else {
      entry.bRatesA = fb.partner_rating
    }
    entry.count++
  }

  // 3. 从 matchHistory 补充配对次数
  const pairCounts = new Map<string, number>()
  for (const [playerName, history] of matchHistories) {
    for (const h of history) {
      const key = pairKey(playerName, h.name)
      pairCounts.set(key, Math.max(pairCounts.get(key) || 0, h.count))
    }
  }

  // 4. 合并构建关系
  const allPairKeys = new Set([...pairFeedbacks.keys(), ...pairCounts.keys()])

  for (const key of allPairKeys) {
    if (relations.has(key)) continue // 已是黑名单

    const fb = pairFeedbacks.get(key)
    const histCount = pairCounts.get(key) || 0
    const feedbackCount = fb ? Math.ceil(fb.count / 2) : 0 // 两条反馈=1次配对
    const totalPairCount = Math.max(histCount, feedbackCount)

    // 检查双五分：双方都给了5分
    const hasMutualFive = fb != null && fb.aRatesB === 5 && fb.bRatesA === 5

    // 检查1分评价 → 自动黑名单
    if (fb && (fb.aRatesB === 1 || fb.bRatesA === 1)) {
      const [a, b] = key.split("||")
      relations.set(key, {
        playerA: a,
        playerB: b,
        status: "blacklist",
        totalPairCount,
        hasMutualFive: false,
        reason: `历史评分1分(自动黑名单)`,
      })
      continue
    }

    // 决定状态
    let status: PairStatus
    let reason: string

    if (hasMutualFive) {
      if (totalPairCount === 1) {
        // 刚双五分，下次冷却
        status = "cooldown"
        reason = `双五分后冷却期(已配${totalPairCount}次)`
      } else if (totalPairCount === 2) {
        // 冷却1次后，该重逢了
        status = "reunion"
        reason = `双五分重逢(已配${totalPairCount}次)`
      } else {
        // 3次以上，回归正常
        status = "normal"
        reason = `双五分已完成重逢周期(已配${totalPairCount}次)`
      }
    } else {
      // 非双五分，有历史配对 → 尽量避免
      status = "avoid"
      reason = `历史配对${totalPairCount}次，非双五分`
    }

    const [a, b] = key.split("||")
    relations.set(key, {
      playerA: a,
      playerB: b,
      status,
      totalPairCount,
      hasMutualFive,
      reason,
    })
  }

  return relations
}

/**
 * 查询两个人的配对关系
 */
export function getPairStatus(
  relations: Map<string, PairRelation>,
  nameA: string,
  nameB: string,
): PairRelation {
  const key = pairKey(nameA, nameB)
  return relations.get(key) || {
    playerA: sortedPair(nameA, nameB)[0],
    playerB: sortedPair(nameA, nameB)[1],
    status: "normal",
    totalPairCount: 0,
    hasMutualFive: false,
    reason: "无历史",
  }
}

// ── 工具函数 ──

function sortedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

function pairKey(a: string, b: string): string {
  const [x, y] = sortedPair(a, b)
  return `${x}||${y}`
}

export { pairKey }
