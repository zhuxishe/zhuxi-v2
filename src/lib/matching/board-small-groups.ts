import { checkGroupConstraints, checkSharedMemberConstraints } from "./constraints"
import { getBoardTimeOptions } from "./board-time-options"
import type { BoardSmallGroupRecommendation } from "./board-types"
import type { MatchingEngineInput } from "./run-input"
import type { MatchCandidate } from "./types"

interface Person { id: string; candidate: MatchCandidate; slots: string[] }
interface Budget { remaining: number; total?: Budget }
type Group = number[]
const MAX_CANDIDATES = 500

function spend(budget: Budget) {
  if (budget.remaining <= 0 || (budget.total && budget.total.remaining <= 0)) return false
  budget.remaining--
  if (budget.total) budget.total.remaining--
  return true
}

/** Coverage first, then population variance, then fewer groups. */
function comparePlans(a: readonly number[], b: readonly number[]) {
  const totalA = a.reduce((sum, size) => sum + size, 0), totalB = b.reduce((sum, size) => sum + size, 0)
  const variance = (sizes: readonly number[], total: number) => sizes.reduce((sum, size) => sum + size * size, 0) / Math.max(1, sizes.length) - (total / Math.max(1, sizes.length)) ** 2
  return totalB - totalA || variance(a, totalA) - variance(b, totalB) || a.length - b.length || b.join("").localeCompare(a.join(""))
}

function sizePlans(total: number): number[][] {
  // Each group count has a monotonically increasing variance sequence as two
  // fives become a four and a six. Merge its heads to materialize only the best
  // 64 plans, instead of building every possible O(n)-sized plan up front.
  const heads: { groups: number; sixes: number; maxSixes: number }[] = []
  for (let groups = Math.ceil(total / 6); groups <= Math.floor(total / 4); groups++) {
    heads.push({ groups, sixes: Math.max(0, total - 5 * groups), maxSixes: Math.floor((total - 4 * groups) / 2) })
  }
  const variance = (head: typeof heads[number]) => {
    const fives = total - 4 * head.groups - 2 * head.sixes
    return (16 * (head.groups - fives - head.sixes) + 25 * fives + 36 * head.sixes) / head.groups - (total / head.groups) ** 2
  }
  const result: number[][] = []
  while (heads.length && result.length < 64) {
    heads.sort((a, b) => variance(a) - variance(b) || a.groups - b.groups)
    const head = heads[0], fives = total - 4 * head.groups - 2 * head.sixes
    result.push([...Array(head.sixes).fill(6), ...Array(fives).fill(5), ...Array(head.groups - head.sixes - fives).fill(4)])
    if (++head.sixes > head.maxSixes) heads.shift()
  }
  return result
}

/**
 * Server-only bounded search. It searches assignments rather than independent
 * time rows, so recommendations never repeat a person. The deterministic node
 * limits bound worst-case work; a valid greedy baseline survives an exhausted
 * search. No recommendation changes a saved assignment or the main algorithm.
 */
export function recommendSmallGroups(engine: MatchingEngineInput, memberIds: readonly string[], preferredSlot: string | null = null): BoardSmallGroupRecommendation[] {
  if (memberIds.length > MAX_CANDIDATES) throw new Error("SMALL_GROUP_TOO_MANY")
  if (memberIds.length < 4) return []
  const mapping = new Map(engine.idMap), byId = new Map(engine.candidates.map((candidate) => [mapping.get(candidate.submissionId) ?? candidate.submissionId, candidate]))
  const source: Person[] = [...new Set(memberIds)].sort().map((id) => {
    const candidate = byId.get(id)
    if (!candidate) throw new Error("SMALL_GROUP_MEMBER_INELIGIBLE")
    const times = getBoardTimeOptions([id], { [id]: candidate }, null)
    if (!times.complete) throw new Error("SMALL_GROUP_TIME_INVALID")
    return { id, candidate, slots: times.commonSlots }
  })
  const relations = new Map(engine.pairRelations)
  const sourceCompatible = source.map((person, a) => source.map((other, b) => a === b || checkSharedMemberConstraints(person.candidate, other.candidate, relations).passed))
  let viable = source.map((_, index) => index).filter((index) => source[index].candidate.gameTypePref !== "双人")
  // Remove provably impossible seeds before spending a combination budget on
  // them. Repeat because removing someone's sole support can make them
  // impossible too. These are necessary conditions, never relaxed group rules.
  while (true) {
    const next = viable.filter((index) => source[index].slots.some((slot) => {
      const others = viable.filter((other) => other !== index && sourceCompatible[index][other] && source[other].slots.includes(slot))
      const pref = source[index].candidate.genderPref
      return others.length >= 3 && (!engine.config.hardConstraints.enforceGender || !pref || pref === "都可以"
        || others.some((other) => !source[other].candidate.gender || source[other].candidate.gender === pref))
    }))
    if (next.length === viable.length) break
    viable = next
  }
  if (viable.length < 4) return []
  const people = viable.map((index) => source[index])
  const compatible = viable.map((a) => viable.map((b) => sourceCompatible[a][b]))
  const compatibleCounts = compatible.map((row) => row.filter(Boolean).length)
  // Scarce availability/compatibility is considered first. The final ID order
  // makes identical input stable even when the database returns another order.
  const constrained = people.map((_, index) => index).sort((a, b) =>
    compatibleCounts[a] - compatibleCounts[b]
    || people[a].slots.length - people[b].slots.length || people[a].id.localeCompare(people[b].id))
  // Interleaving gender buckets avoids spending the combination budget on a
  // long same-gender prefix when complementary group preferences are present.
  const buckets = [...new Set(constrained.map((index) => people[index].candidate.gender))]
    .map((gender) => constrained.filter((index) => people[index].candidate.gender === gender))
    .sort((a, b) => a.length - b.length || people[a[0]].id.localeCompare(people[b[0]].id))
  const order: number[] = []
  for (let offset = 0; order.length < people.length; offset++) for (const bucket of buckets) if (bucket[offset] !== undefined) order.push(bucket[offset])
  const valid = (indices: Group) => checkGroupConstraints(people[indices[0]].candidate, indices.slice(1).map((index) => people[index].candidate), engine.config, relations).passed

  function visitGroups(remaining: number[], size: number, budget: Budget, accept: (group: Group) => boolean): boolean {
    const first = remaining[0]
    if (first === undefined || people[first].candidate.gameTypePref === "双人" || !people[first].slots.length) return false
    const selected = [first]
    function visit(start: number, shared: string[]): boolean {
      if (!spend(budget)) return false
      if (selected.length === size) return valid(selected) && accept([...selected])
      const needed = size - selected.length
      for (let next = start; next <= remaining.length - needed; next++) {
        if (budget.remaining <= 0) break
        const index = remaining[next]
        if (people[index].candidate.gameTypePref === "双人" || selected.some((prior) => !compatible[prior][index])) continue
        const common = shared.filter((slot) => people[index].slots.includes(slot))
        if (!common.length) continue
        selected.push(index)
        if (visit(next + 1, common)) return true
        selected.pop()
      }
      return false
    }
    return visit(1, people[first].slots)
  }

  const plans = new Map<number, number[][]>()
  const plansFor = (total: number) => {
    let cached = plans.get(total)
    if (!cached) {
      cached = sizePlans(total)
      if (plans.size >= 16) plans.delete(plans.keys().next().value!)
      plans.set(total, cached)
    }
    return cached
  }
  const better = (left: Group[], right: Group[]) => comparePlans(left.map((group) => group.length), right.map((group) => group.length)) < 0
  function greedy(largestFirst: boolean): Group[] {
    let remaining = [...order]
    const result: Group[] = [], budget = { remaining: 6000 }
    while (remaining.length >= 4 && budget.remaining > 0) {
      const balanced = plansFor(remaining.length)[0]?.[0] ?? 6
      const sizes = [...new Set(largestFirst ? [6, 5, 4] : [balanced, 6, 5, 4])]
      let found: Group | undefined
      const anchorBudget = { remaining: Math.min(budget.remaining, Math.max(24, Math.floor(6000 / remaining.length))), total: budget }
      for (const size of sizes) {
        if (size > remaining.length) continue
        if (visitGroups(remaining, size, anchorBudget, (group) => { found = group; return true })) break
      }
      if (found) { result.push(found); const used = new Set(found); remaining = remaining.filter((id) => !used.has(id)) }
      else remaining.shift()
    }
    return result
  }
  let best = greedy(false)
  const larger = greedy(true)
  if (better(larger, best)) best = larger
  const searchBudget = { remaining: 50000 }
  const bestTotal = () => best.reduce((sum, group) => sum + group.length, 0)
  function partition(remaining: number[], sizes: number[], groups: Group[], budget: Budget): Group[] | null {
    if (!sizes.length) return groups
    if (!spend(budget)) return null
    const needed = sizes.reduce((sum, size) => sum + size, 0)
    if (remaining.length < needed) return null
    let answer: Group[] | null = null
    for (const size of new Set(sizes)) {
      const nextSizes = [...sizes]
      nextSizes.splice(nextSizes.indexOf(size), 1)
      visitGroups(remaining, size, budget, (group) => {
        const used = new Set(group)
        answer = partition(remaining.filter((id) => !used.has(id)), nextSizes, [...groups, group], budget)
        return answer !== null
      })
      if (answer || budget.remaining <= 0 || searchBudget.remaining <= 0) break
    }
    if (answer) return answer
    if (remaining.length > needed && budget.remaining > 0 && searchBudget.remaining > 0) return partition(remaining.slice(1), sizes, groups, budget)
    return null
  }
  for (let total = people.length; total >= Math.max(4, bestTotal()) && searchBudget.remaining > 0; total--) {
    for (const sizes of plansFor(total)) {
      if (comparePlans(sizes, best.map((group) => group.length)) >= 0) continue
      const result = partition(order, sizes, [], { remaining: Math.min(3000, searchBudget.remaining), total: searchBudget })
      if (result) { best = result; break }
      if (searchBudget.remaining <= 0) break
    }
    if (bestTotal() === total) break
  }
  return best.map((group) => {
    const ids = group.map((index) => people[index].id).sort()
    const prefs = Object.fromEntries(group.map((index) => [people[index].id, people[index].candidate]))
    const times = getBoardTimeOptions(ids, prefs, preferredSlot)
    return { key: `small:${ids.join(":")}`, memberIds: ids, bestSlot: times.commonSlots[0], commonSlots: times.commonSlots }
  })
}
