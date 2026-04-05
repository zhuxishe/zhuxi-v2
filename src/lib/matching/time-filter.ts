/**
 * 时间段分组 — 找出有共同空闲时段的玩家
 */

import type { MatchCandidate, Availability, TimeSlot } from "./types"

export interface TimeGroup {
  date: string     // "2026-04-06"
  slot: string     // "上午" | "下午" | "晚上"
  key: string      // "2026-04-06_上午"
  candidates: MatchCandidate[]
}

/**
 * 获取两个玩家的共同可用时段
 */
export function getCommonSlots(
  a: Availability,
  b: Availability,
): { date: string; slot: string }[] {
  const common: { date: string; slot: string }[] = []
  for (const date of Object.keys(a)) {
    if (!b[date]) continue
    const slotsA = new Set(a[date])
    for (const slot of b[date]) {
      if (slotsA.has(slot)) {
        common.push({ date, slot })
      }
    }
  }
  return common
}

/**
 * 检查两个玩家是否有至少一个共同时段
 */
export function hasCommonSlot(a: Availability, b: Availability): boolean {
  for (const date of Object.keys(a)) {
    if (!b[date]) continue
    const slotsA = new Set(a[date])
    for (const slot of b[date]) {
      if (slotsA.has(slot)) return true
    }
  }
  return false
}

/**
 * 将所有候选人按时段分组
 * 一个候选人可能出现在多个组中（多个可用时段）
 */
export function groupByTimeSlot(candidates: MatchCandidate[]): TimeGroup[] {
  const groupMap = new Map<string, MatchCandidate[]>()

  for (const c of candidates) {
    for (const [date, slots] of Object.entries(c.availability)) {
      for (const slot of slots) {
        const key = `${date}_${slot}`
        if (!groupMap.has(key)) groupMap.set(key, [])
        groupMap.get(key)!.push(c)
      }
    }
  }

  return Array.from(groupMap.entries())
    .map(([key, candidates]) => {
      const [date, slot] = key.split("_")
      return { date, slot, key, candidates }
    })
    .sort((a, b) => a.key.localeCompare(b.key))
}

/**
 * 获取时段热力图数据
 */
export function getAvailabilityHeatmap(
  candidates: MatchCandidate[],
): Map<string, number> {
  const heatmap = new Map<string, number>()
  for (const c of candidates) {
    for (const [date, slots] of Object.entries(c.availability)) {
      for (const slot of slots) {
        const key = `${date}_${slot}`
        heatmap.set(key, (heatmap.get(key) || 0) + 1)
      }
    }
  }
  return heatmap
}
