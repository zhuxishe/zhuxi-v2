/** 最大覆盖多人分组匹配（两轮） */

import type { MatchCandidate, MatchingConfig } from "./types"
import type { PairRelation } from "./pair-history"
import { getCommonSlots } from "./time-filter"
import { checkGroupConstraints, groupHasAvoidPairs } from "./constraints"
import { findGroupBestSlot } from "./match-utils"
import { scorePair } from "./scorer"

function computeGroupAvgScore(
  members: MatchCandidate[],
  config: MatchingConfig,
  pairRelations?: Map<string, PairRelation>,
): number {
  if (members.length < 2) return 0
  let total = 0, count = 0
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const score = scorePair(members[i], members[j], config, pairRelations)
      if (!score.hardVeto) { total += score.totalScore; count++ }
    }
  }
  return count > 0 ? Math.round((total / count) * 10) / 10 : 0
}

export interface MultiGroupResult {
  groups: { members: MatchCandidate[]; bestSlot: string; avgScore: number; hasRepeat: boolean }[]
  unmatched: MatchCandidate[]
}

export function runMaxCoverageMultiMatching(
  candidates: MatchCandidate[],
  config: MatchingConfig,
  groupSize: number = 6,
  pairRelations?: Map<string, PairRelation>,
): MultiGroupResult {
  if (candidates.length < 3) {
    return { groups: [], unmatched: [...candidates] }
  }

  // Round 1: avoid repeats
  const round1 = runMultiRound(candidates, config, groupSize, pairRelations, true)
  const matched1 = new Set(round1.groups.flatMap((g) => g.members.map((m) => m.submissionId)))
  const unmatched1 = candidates.filter((c) => !matched1.has(c.submissionId))

  // Round 2: relax repeats
  const round2 = unmatched1.length >= 3
    ? runMultiRound(unmatched1, config, groupSize, pairRelations, false)
    : { groups: [], unmatched: unmatched1 }

  return {
    groups: [
      ...round1.groups.map((g) => ({ ...g, hasRepeat: false })),
      ...round2.groups.map((g) => ({ ...g, hasRepeat: true })),
    ],
    unmatched: round2.unmatched,
  }
}

function runMultiRound(
  candidates: MatchCandidate[],
  config: MatchingConfig,
  groupSize: number,
  pairRelations: Map<string, PairRelation> | undefined,
  strictAvoid: boolean,
): { groups: { members: MatchCandidate[]; bestSlot: string; avgScore: number }[]; unmatched: MatchCandidate[] } {
  const n = candidates.length
  const assigned = new Set<number>()
  const groups: { members: MatchCandidate[]; bestSlot: string; avgScore: number }[] = []

  // 最受约束优先：约束多的人先处理（灵活度低的先组队）
  const order = Array.from({ length: n }, (_, i) => i)
    .sort((a, b) => {
      const ca = candidates[a], cb = candidates[b]
      // 1. 有性别偏好的人更受约束（非"都可以"优先）
      const gA = (ca.genderPref && ca.genderPref !== "都可以") ? 0 : 1
      const gB = (cb.genderPref && cb.genderPref !== "都可以") ? 0 : 1
      if (gA !== gB) return gA - gB
      // 2. 可用时段少的人更受约束
      const sA = Object.values(ca.availability).reduce((s, v) => s + v.length, 0)
      const sB = Object.values(cb.availability).reduce((s, v) => s + v.length, 0)
      return sA - sB
    })

  for (const seed of order) {
    if (assigned.has(seed)) continue
    const group = tryBuildGroup(candidates, seed, n, assigned, config, groupSize, pairRelations, strictAvoid)
    if (group) {
      for (const gi of group) assigned.add(gi)
      const groupMembers = group.map((i) => candidates[i])
      groups.push({
        members: groupMembers,
        bestSlot: findGroupBestSlot(groupMembers),
        avgScore: computeGroupAvgScore(groupMembers, config, pairRelations),
      })
    }
  }

  return { groups, unmatched: candidates.filter((_, i) => !assigned.has(i)) }
}

function tryBuildGroup(
  candidates: MatchCandidate[],
  seed: number, n: number,
  assigned: Set<number>,
  config: MatchingConfig, groupSize: number,
  pairRelations: Map<string, PairRelation> | undefined,
  strictAvoid: boolean,
): number[] | null {
  const compatible: number[] = []
  for (let j = 0; j < n; j++) {
    if (j === seed || assigned.has(j)) continue
    const common = getCommonSlots(candidates[seed].availability, candidates[j].availability)
    if (common.length === 0) continue
    if (!checkGroupConstraints(candidates[j], [candidates[seed]], config, pairRelations).passed) continue
    if (strictAvoid && groupHasAvoidPairs(candidates[j], [candidates[seed]], pairRelations)) continue
    compatible.push(j)
  }

  if (compatible.length < 2) return null

  const group = [seed]
  assigned.add(seed)

  while (group.length < groupSize && compatible.length > 0) {
    const bestIdx = findBestCandidate(candidates, group, compatible, assigned, config, pairRelations, strictAvoid)
    if (bestIdx === -1) break
    group.push(compatible[bestIdx])
    assigned.add(compatible[bestIdx])
    compatible.splice(bestIdx, 1)
  }

  if (group.length >= 3) return group

  // Rollback
  for (const gi of group) assigned.delete(gi)
  return null
}

function findBestCandidate(
  candidates: MatchCandidate[],
  group: number[], compatible: number[],
  assigned: Set<number>,
  config: MatchingConfig,
  pairRelations: Map<string, PairRelation> | undefined,
  strictAvoid: boolean,
): number {
  let bestIdx = -1
  let bestCount = -1

  for (let ci = 0; ci < compatible.length; ci++) {
    const cand = compatible[ci]
    if (assigned.has(cand)) continue

    const groupMembers = group.map((gi) => candidates[gi])
    if (!checkGroupConstraints(candidates[cand], groupMembers, config, pairRelations).passed) continue
    if (strictAvoid && groupHasAvoidPairs(candidates[cand], groupMembers, pairRelations)) continue

    let commonCount = 0
    let commonWithAll = true
    for (const gi of group) {
      const common = getCommonSlots(candidates[cand].availability, candidates[gi].availability)
      if (common.length === 0) { commonWithAll = false; break }
      commonCount += common.length
    }

    if (commonWithAll && commonCount > bestCount) {
      bestCount = commonCount; bestIdx = ci
    }
  }

  return bestIdx
}
