import { checkHardConstraints, checkSharedMemberConstraints } from "./constraints"
import { EXACT_COVERAGE_LIMIT } from "./coverage-plan"
import { getCommonSlots } from "./time-filter"
import type { MatchingEngineInput } from "./run-input"

export interface SavedUnmatchedDiagnostic {
  member_id: string
  reason: string
  details: {
    version: "matching_diagnostic:1"
    code: "no_common_time" | "no_feasible_combination" | "not_selected"
    cohort_size: number
    shared_time_peer_count: number
    feasible_duo_count: number
    multi_max_shared_peer_count: number
    search_mode: "exhaustive" | "bounded"
  }
}

/**
 * Explain only facts established against the complete frozen cohort. A pool's
 * compatible shared-slot peers are an upper bound: they need not be compatible
 * with one another. Therefore an upper bound of two or more never proves that
 * a valid pool exists, or that the algorithm should have selected this member.
 * No scores, private relation reasons, names or other member IDs are persisted.
 */
export function buildUnmatchedDiagnostics(
  engine: Pick<MatchingEngineInput, "candidates" | "config" | "idMap" | "pairRelations">,
  unmatchedIds: readonly string[],
): SavedUnmatchedDiagnostic[] {
  const unmatched = new Set(unmatchedIds)
  const ids = new Map(engine.idMap)
  const relations = new Map(engine.pairRelations)
  return engine.candidates.filter((candidate) => unmatched.has(candidate.submissionId)).map((candidate) => {
    let sharedTimePeers = 0, feasibleDuos = 0
    const multiSlotPeers = new Map<string, number>()
    for (const other of engine.candidates) {
      if (other === candidate) continue
      const common = getCommonSlots(candidate.availability, other.availability)
      if (!common.length) continue
      sharedTimePeers++
      if (candidate.gameTypePref !== "多人" && other.gameTypePref !== "多人"
        && checkHardConstraints(candidate, other, engine.config, relations).passed) feasibleDuos++
      // Multiplayer gender preferences are evaluated across a complete pool,
      // not as mutual pair preferences. Do not veto this upper bound on gender.
      if (candidate.gameTypePref !== "双人" && other.gameTypePref !== "双人"
        && checkSharedMemberConstraints(candidate, other, relations).passed) {
        for (const slot of new Set(common.map(({ date, slot }) => `${date}_${slot}`))) {
          multiSlotPeers.set(slot, (multiSlotPeers.get(slot) ?? 0) + 1)
        }
      }
    }
    const multiMaxPeers = Math.max(0, ...multiSlotPeers.values())
    const code = sharedTimePeers === 0 ? "no_common_time"
      : feasibleDuos === 0 && multiMaxPeers < 2 ? "no_feasible_combination" : "not_selected"
    return {
      member_id: ids.get(candidate.submissionId) ?? candidate.submissionId,
      reason: code,
      details: {
        version: "matching_diagnostic:1", code, cohort_size: engine.candidates.length,
        shared_time_peer_count: sharedTimePeers, feasible_duo_count: feasibleDuos,
        multi_max_shared_peer_count: multiMaxPeers,
        search_mode: engine.candidates.length <= EXACT_COVERAGE_LIMIT ? "exhaustive" : "bounded",
      },
    }
  })
}
