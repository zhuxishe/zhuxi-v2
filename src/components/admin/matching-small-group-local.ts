import { getBoardTimeOptions } from "@/lib/matching/board-time-options"
import type { BoardSmallGroupRecommendation, BoardSubmissionPreference } from "@/lib/matching/board-types"

/** Removing assigned members changes only affected suggestions; other groups keep their members and order. */
export function availableSmallGroups(groups: BoardSmallGroupRecommendation[], waitingIds: string[], prefs: Record<string, BoardSubmissionPreference>) {
  const waiting = new Set(waitingIds)
  return groups.map((group) => {
    const memberIds = group.memberIds.filter((id) => waiting.has(id))
    return { ...group, memberIds, commonSlots: getBoardTimeOptions(memberIds, prefs, group.bestSlot).commonSlots }
  }).filter((group) => group.memberIds.length > 0)
}

export function moveSmallGroupCandidate(groups: BoardSmallGroupRecommendation[], memberId: string, targetKey: string, prefs: Record<string, BoardSubmissionPreference>) {
  const target = groups.find((group) => group.key === targetKey)
  if (!target) throw new Error("目标推荐已变化，请重新选择。")
  if (target.memberIds.includes(memberId)) return groups
  const memberIds = [...target.memberIds, memberId]
  const times = getBoardTimeOptions(memberIds, prefs, target.bestSlot)
  if (!times.complete || !times.currentValid) throw new Error("此人无法参加该组的推荐时段，请选择拥有相同日期和时段的小组。")
  return groups.map((group) => {
    const ids = group.key === targetKey ? memberIds : group.memberIds.filter((id) => id !== memberId)
    return { ...group, memberIds: ids, commonSlots: getBoardTimeOptions(ids, prefs, group.bestSlot).commonSlots }
  }).filter((group) => group.memberIds.length > 0)
}
