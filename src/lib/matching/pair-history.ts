/**
 * 配对关系管理 — 类型定义和查询
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

// Re-export buildPairRelations for backward compatibility
export { buildPairRelations } from "./pair-history-build"

export type PairStatus = "blacklist" | "cooldown" | "reunion" | "avoid" | "normal"

export interface PairRelation {
  playerA: string
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

export function sortedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

export function pairKey(a: string, b: string): string {
  const [x, y] = sortedPair(a, b)
  return `${x}||${y}`
}
