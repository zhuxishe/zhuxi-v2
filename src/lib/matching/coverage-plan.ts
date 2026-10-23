/** One unrestricted-size shared multiplayer pool and disjoint duos.
 * Objectives: coverage, fewer ordinary repeated relations, person-weighted old
 * scores, then larger multiplayer pool. Fixed budgets keep replay deterministic.
 */
import { checkGroupConstraints, checkSharedMemberConstraints } from "./constraints"
import { findGroupBestSlot, tryPair, type FeasiblePair } from "./match-utils"
import { getPairStatus, type PairRelation } from "./pair-history"
import { scorePairFactors } from "./scorer"
import type { MatchCandidate, MatchingConfig } from "./types"

export const EXACT_COVERAGE_LIMIT = 18
export const COVERAGE_SEARCH_BUDGET = { nodes: 40_000, plans: 192, greedyOrders: 12 } as const
interface Objective { covered: number; repeats: number; quality: number }
export interface CoveragePlan {
  duos: FeasiblePair[]; multi: number[]; multiScore: number; multiHasRepeat: boolean
  multiBestSlot: string | null; objective: Objective; exact: boolean
}
interface Graph {
  candidates: MatchCandidate[]; duo: (FeasiblePair | null)[][]; shared: boolean[][]
  scores: number[][]; repeats: boolean[][]; multiIndices: number[]; duoIndices: number[]
  slots: Set<string>[]; config: MatchingConfig; relations?: Map<string, PairRelation>
}
function better(a: Objective, b: Objective): boolean {
  return a.covered !== b.covered ? a.covered > b.covered : a.repeats !== b.repeats ? a.repeats < b.repeats : a.quality > b.quality + 1e-9
}
function tied(a: Objective, b: Objective): boolean {
  return a.covered === b.covered && a.repeats === b.repeats && Math.abs(a.quality - b.quality) <= 1e-9
}
function makeGraph(candidates: MatchCandidate[], config: MatchingConfig, relations?: Map<string, PairRelation>): Graph {
  const n = candidates.length
  const duo = Array.from({ length: n }, () => Array<FeasiblePair | null>(n).fill(null))
  const shared = Array.from({ length: n }, () => Array<boolean>(n).fill(false))
  const scores = Array.from({ length: n }, () => Array<number>(n).fill(0))
  const repeats = Array.from({ length: n }, () => Array<boolean>(n).fill(false))
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (candidates[i].gameTypePref !== "多人" && candidates[j].gameTypePref !== "多人") duo[i][j] = duo[j][i] = tryPair(candidates, i, j, config, relations, false)
    shared[i][j] = shared[j][i] = checkSharedMemberConstraints(candidates[i], candidates[j], relations).passed
    if (shared[i][j]) scores[i][j] = scores[j][i] = scorePairFactors(candidates[i], candidates[j], config).totalScore
    repeats[i][j] = repeats[j][i] = !!relations && getPairStatus(relations, candidates[i].submissionId, candidates[j].submissionId).status === "avoid"
  }
  return { candidates, duo, shared, scores, repeats, config, relations,
    multiIndices: candidates.flatMap((c, i) => c.gameTypePref !== "双人" ? [i] : []),
    duoIndices: candidates.flatMap((c, i) => c.gameTypePref !== "多人" ? [i] : []),
    slots: candidates.map((c) => new Set(Object.entries(c.availability).flatMap(([date, slots]) => slots.map((slot) => `${date}_${slot}`)))),
  }
}
function poolMetrics(graph: Graph, multi: number[]) {
  let sum = 0, repeats = 0
  for (let i = 0; i < multi.length; i++) for (let j = i + 1; j < multi.length; j++) {
    sum += graph.scores[multi[i]][multi[j]]; repeats += Number(graph.repeats[multi[i]][multi[j]])
  }
  return { score: multi.length < 2 ? 0 : sum / (multi.length * (multi.length - 1) / 2), repeats }
}
function supportsGender(graph: Graph, i: number, others: number[]): boolean {
  if (!graph.config.hardConstraints.enforceGender) return true
  const pref = graph.candidates[i].genderPref
  return !pref || pref === "都可以" || others.some((j) => {
    if (i === j || !graph.shared[i][j]) return false
    const gender = graph.candidates[j].gender
    return !gender || (pref === "男" && gender === "男") || (pref === "女" && gender === "女")
  })
}
function validGender(graph: Graph, multi: number[]): boolean {
  return multi.every((i) => supportsGender(graph, i, multi))
}
/** Removing an unsupported member cannot remove any valid complete pool. */
function supportedSubset(graph: Graph, indices: number[]): number[] {
  let remaining = indices
  for (;;) {
    const next = remaining.filter((i) => supportsGender(graph, i, remaining))
    if (next.length === remaining.length) return remaining
    remaining = next
  }
}
function validPool(graph: Graph, multi: number[]): boolean {
  if (!multi.length) return true
  if (multi.length < 3) return false
  const members = multi.map((i) => graph.candidates[i])
  return !!findGroupBestSlot(members) && checkGroupConstraints(members[0], members.slice(1), graph.config, graph.relations).passed
}
function joinPlan(graph: Graph, multi: number[], duos: FeasiblePair[], exact: boolean): CoveragePlan {
  const metrics = poolMetrics(graph, multi)
  return { duos, multi: [...multi], multiScore: Math.round(metrics.score * 10) / 10,
    multiHasRepeat: metrics.repeats > 0, multiBestSlot: multi.length ? findGroupBestSlot(multi.map((i) => graph.candidates[i])) : null,
    objective: { covered: multi.length + duos.length * 2,
      repeats: metrics.repeats + duos.filter((p) => p.isRepeat).length,
      quality: metrics.score * multi.length + duos.reduce((sum, p) => sum + p.score.totalScore * 2, 0) }, exact }
}
function bestPlan(a: CoveragePlan, b: CoveragePlan) {
  return better(a.objective, b.objective) || (tied(a.objective, b.objective) && a.multi.length > b.multi.length) ? a : b
}

/** Exhaustive single-pool subsets + memoized arbitrary-graph duo matching. */
function exactSearch(graph: Graph): CoveragePlan {
  const memo = new Map<number, Objective & { choice: number }>()
  memo.set(0, { covered: 0, repeats: 0, quality: 0, choice: -1 })
  const solve = (mask: number): Objective & { choice: number } => {
    const cached = memo.get(mask)
    if (cached) return cached
    const low = mask & -mask, i = 31 - Math.clz32(low), rest = mask ^ low
    let best = { ...solve(rest), choice: -1 }
    for (let rem = rest; rem; rem &= rem - 1) {
      const j = 31 - Math.clz32(rem & -rem), edge = graph.duo[i][j]
      if (!edge) continue
      const tail = solve(rest ^ (1 << j))
      const option = { covered: tail.covered + 2, repeats: tail.repeats + Number(edge.isRepeat), quality: tail.quality + edge.score.totalScore * 2, choice: j }
      if (better(option, best)) best = option
    }
    memo.set(mask, best); return best
  }
  const reconstruct = (initial: number): FeasiblePair[] => {
    const result: FeasiblePair[] = []; let mask = initial
    while (mask) {
      const low = mask & -mask, i = 31 - Math.clz32(low), j = solve(mask).choice
      mask ^= low
      if (j >= 0) { result.push(graph.duo[i][j]!); mask ^= 1 << j }
    }
    return result
  }
  const duoMask = graph.duoIndices.reduce((mask, i) => mask | (1 << i), 0)
  let best = joinPlan(graph, [], reconstruct(duoMask), true)
  const visit = (multi: number[], next: number, common: Set<string> | null, mask: number, sum: number, repeats: number) => {
    if (multi.length >= 3 && validGender(graph, multi)) {
      const remaining = duoMask & ~mask, duo = solve(remaining)
      const objective = { covered: multi.length + duo.covered, repeats: repeats + duo.repeats,
        quality: sum / (multi.length * (multi.length - 1) / 2) * multi.length + duo.quality }
      if (better(objective, best.objective) || (tied(objective, best.objective) && multi.length > best.multi.length)) best = joinPlan(graph, multi, reconstruct(remaining), true)
    }
    for (let at = next; at < graph.multiIndices.length; at++) {
      const i = graph.multiIndices[at]
      if (multi.some((j) => !graph.shared[i][j])) continue
      const slots = common === null ? graph.slots[i] : new Set([...common].filter((key) => graph.slots[i].has(key)))
      if (!slots.size) continue
      let addedScore = 0, addedRepeats = 0
      for (const j of multi) { addedScore += graph.scores[i][j]; addedRepeats += Number(graph.repeats[i][j]) }
      multi.push(i); visit(multi, at + 1, slots, mask | (1 << i), sum + addedScore, repeats + addedRepeats); multi.pop()
    }
  }
  visit([], 0, null, 0, 0, 0); return best
}

/** Edmonds' blossom on global vertex indices. Exported for independent graph tests. */
export function maximumCardinalityPairs(adjacency: number[][]): [number, number][] {
  const n = adjacency.length, match = Array<number>(n).fill(-1)
  let parent = Array<number>(n).fill(-1), base = Array.from({ length: n }, (_, i) => i)
  let used = Array<boolean>(n).fill(false), blossom = Array<boolean>(n).fill(false)
  const lca = (initialA: number, initialB: number): number => {
    const path = Array<boolean>(n).fill(false); let a = initialA, b = initialB
    for (;;) { a = base[a]; path[a] = true; if (match[a] === -1) break; a = parent[match[a]] }
    for (;;) { b = base[b]; if (path[b]) return b; b = parent[match[b]] }
  }
  const markPath = (initial: number, root: number, initialChild: number) => {
    let vertex = initial, child = initialChild
    while (base[vertex] !== root) {
      blossom[base[vertex]] = blossom[base[match[vertex]]] = true; parent[vertex] = child
      child = match[vertex]; vertex = parent[match[vertex]]
    }
  }
  const findPath = (root: number): number => {
    used = Array<boolean>(n).fill(false); parent = Array<number>(n).fill(-1); base = Array.from({ length: n }, (_, i) => i)
    const queue = [root]; used[root] = true
    for (let head = 0; head < queue.length; head++) {
      const vertex = queue[head]
      for (const neighbor of adjacency[vertex]) {
        if (base[vertex] === base[neighbor] || match[vertex] === neighbor) continue
        if (neighbor === root || (match[neighbor] !== -1 && parent[match[neighbor]] !== -1)) {
          const rootBase = lca(vertex, neighbor); blossom = Array<boolean>(n).fill(false)
          markPath(vertex, rootBase, neighbor); markPath(neighbor, rootBase, vertex)
          for (let i = 0; i < n; i++) if (blossom[base[i]]) { base[i] = rootBase; if (!used[i]) { used[i] = true; queue.push(i) } }
        } else if (parent[neighbor] === -1) {
          parent[neighbor] = vertex
          if (match[neighbor] === -1) return neighbor
          const next = match[neighbor]; used[next] = true; queue.push(next)
        }
      }
    }
    return -1
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => adjacency[a].length - adjacency[b].length || a - b)
  for (const i of order) if (match[i] === -1) {
    let vertex = findPath(i)
    while (vertex !== -1) { const previous = parent[vertex], next = match[previous]; match[vertex] = previous; match[previous] = vertex; vertex = next }
  }
  return match.flatMap((j, i) => j > i ? [[i, j] as [number, number]] : [])
}
function solveLargeDuo(graph: Graph, active: number[]): FeasiblePair[] {
  const adjacency = active.map((i) => active.flatMap((j, local) => graph.duo[i][j] ? [local] : [])
    .sort((a, b) => Number(graph.duo[i][active[a]]!.isRepeat) - Number(graph.duo[i][active[b]]!.isRepeat)
      || graph.duo[i][active[b]]!.score.totalScore - graph.duo[i][active[a]]!.score.totalScore || a - b))
  const result = maximumCardinalityPairs(adjacency).map(([i, j]) => graph.duo[active[i]][active[j]]!)
  for (let iteration = 0; iteration < 4; iteration++) {
    let improved = false
    for (let p = 0; p < result.length; p++) for (let q = p + 1; q < result.length; q++) {
      const a = result[p], b = result[q]
      const current = { covered: 4, repeats: Number(a.isRepeat) + Number(b.isRepeat), quality: a.score.totalScore + b.score.totalScore }
      for (const [x, y, z, w] of [[a.i, b.i, a.j, b.j], [a.i, b.j, a.j, b.i]]) {
        const first = graph.duo[x][y], second = graph.duo[z][w]
        if (first && second && better({ covered: 4, repeats: Number(first.isRepeat) + Number(second.isRepeat), quality: first.score.totalScore + second.score.totalScore }, current)) {
          result[p] = first; result[q] = second; improved = true; break
        }
      }
    }
    if (!improved) break
  }
  return result
}
function boundedSearch(graph: Graph): CoveragePlan {
  let best = joinPlan(graph, [], [], false), evaluations = 0, nodes = 0
  const seen = new Set<string>(), duoCache = new Map<string, FeasiblePair[]>()
  const evaluate = (members: number[], limit: number = COVERAGE_SEARCH_BUDGET.plans) => {
    if (evaluations >= limit) return
    const multi = [...members].sort((a, b) => a - b), key = multi.join(",")
    if (seen.has(key) || !validPool(graph, multi)) return
    seen.add(key)
    const selected = new Set(multi), active = graph.duoIndices.filter((i) => !selected.has(i)), duoKey = active.join(",")
    let duos = duoCache.get(duoKey)
    if (!duos) { duos = solveLargeDuo(graph, active); duoCache.set(duoKey, duos) }
    evaluations++; best = bestPlan(joinPlan(graph, multi, duos, false), best)
  }
  evaluate([])
  const slots = new Map<string, number[]>()
  for (const i of graph.multiIndices) for (const key of graph.slots[i]) { const members = slots.get(key) ?? []; members.push(i); slots.set(key, members) }
  const orderedSlots = [...slots.entries()].filter(([, members]) => members.length >= 3)
    .sort(([aKey, a], [bKey, b]) => b.filter((i) => graph.candidates[i].gameTypePref === "多人").length - a.filter((i) => graph.candidates[i].gameTypePref === "多人").length
      || b.length - a.length || (aKey < bKey ? -1 : aKey > bKey ? 1 : 0))
  const prepared = orderedSlots.map(([, slotIndices]) => {
    const indices = supportedSubset(graph, slotIndices)
    const degree = new Map(indices.map((i) => [i, indices.filter((j) => graph.shared[i][j]).length]))
    const ordered = [...indices].sort((a, b) => Number(graph.candidates[a].gameTypePref !== "多人") - Number(graph.candidates[b].gameTypePref !== "多人")
      || degree.get(b)! - degree.get(a)! || graph.duo[a].filter(Boolean).length - graph.duo[b].filter(Boolean).length || a - b)
    return ordered
  })
  const greedyPrefixes = (ordered: number[], seed: number) => {
      const pool: number[] = [], prefixes: number[][] = []
      const order = seed ? [ordered[seed], ...ordered.filter((i) => i !== ordered[seed])] : ordered
      for (const i of order) {
        if (++nodes > COVERAGE_SEARCH_BUDGET.nodes) break
        if (pool.every((j) => graph.shared[i][j])) { pool.push(i); if (pool.length >= 3) prefixes.push([...pool]) }
      }
      const supported = supportedSubset(graph, pool)
      if (supported.length >= 3 && supported.length !== pool.length) prefixes.push(supported)
      return prefixes.reverse()
  }
  // Give every slot a complete greedy representative before an early slot can
  // consume the plan budget with many prefixes of nearly the same pool.
  const firstPrefixes = prepared.map((ordered) => greedyPrefixes(ordered, 0))
  for (const prefixes of firstPrefixes) if (prefixes.length) evaluate(prefixes[0])
  for (let slotIndex = 0; slotIndex < prepared.length; slotIndex++) {
    if (nodes >= COVERAGE_SEARCH_BUDGET.nodes || evaluations >= COVERAGE_SEARCH_BUDGET.plans) break
    const ordered = prepared[slotIndex]
    const limit = evaluations + Math.ceil((COVERAGE_SEARCH_BUDGET.plans - evaluations) / (prepared.length - slotIndex))
    for (const prefix of firstPrefixes[slotIndex]) evaluate(prefix, limit)
    for (let seed = 1; seed < Math.min(ordered.length, COVERAGE_SEARCH_BUDGET.greedyOrders) && evaluations < limit; seed++) {
      for (const prefix of greedyPrefixes(ordered, seed)) evaluate(prefix, limit)
    }
    const visit = (pool: number[], possible: number[]) => {
      if (++nodes > COVERAGE_SEARCH_BUDGET.nodes || evaluations >= limit) return
      const upper = graph.duoIndices.length + pool.filter((i) => graph.candidates[i].gameTypePref === "多人").length + possible.filter((i) => graph.candidates[i].gameTypePref === "多人").length
      if (upper < best.objective.covered) return
      const support = [...pool, ...possible]
      if (pool.some((i) => !supportsGender(graph, i, support))) return
      if (pool.length >= 3) evaluate(pool, limit)
      for (let at = 0; at < possible.length; at++) {
        const i = possible[at]; visit([...pool, i], possible.slice(at + 1).filter((j) => graph.shared[i][j]))
        if (nodes >= COVERAGE_SEARCH_BUDGET.nodes || evaluations >= limit) break
      }
    }
    visit([], ordered)
  }
  return best
}
export function findCoveragePlan(candidates: MatchCandidate[], config: MatchingConfig, relations?: Map<string, PairRelation>): CoveragePlan {
  const graph = makeGraph(candidates, config, relations)
  const plan = candidates.length <= EXACT_COVERAGE_LIMIT ? exactSearch(graph) : boundedSearch(graph)
  if (!validPool(graph, plan.multi)) throw new Error("Matching produced an invalid multiplayer pool")
  return plan
}
