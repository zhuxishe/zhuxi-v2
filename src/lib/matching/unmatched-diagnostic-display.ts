export const UNMATCHED_DIAGNOSTIC_REASONS = {
  no_common_time: "原批次中，与其他候选人没有共同可用时段",
  no_feasible_combination: "原批次中，没有满足硬约束的双人搭档，且多人组合的必要条件不满足",
  not_selected: "本次方案中未分配；不能据此认定无法匹配",
} as const

/** Saved, versioned diagnostics only. Never reconstruct reasons from live forms. */
export function unmatchedDiagnosticMessages(value: unknown): string[] {
  const historical = ["历史记录未保存详细原因，无法据此确定未匹配原因"]
  if (!value || typeof value !== "object" || Array.isArray(value)) return historical
  const details = value as Record<string, unknown>
  if (details.version !== "matching_diagnostic:1"
    || typeof details.code !== "string" || !Object.hasOwn(UNMATCHED_DIAGNOSTIC_REASONS, details.code)
    || (details.search_mode !== "exhaustive" && details.search_mode !== "bounded")) return historical
  const counts = [details.cohort_size, details.shared_time_peer_count, details.feasible_duo_count, details.multi_max_shared_peer_count]
  if (!counts.every((count) => typeof count === "number" && Number.isSafeInteger(count) && count >= 0)
    || (details.cohort_size as number) < 1
    || counts.slice(1).some((count) => (count as number) >= (details.cohort_size as number))
    || (details.feasible_duo_count as number) > (details.shared_time_peer_count as number)
    || (details.multi_max_shared_peer_count as number) > (details.shared_time_peer_count as number)) return historical
  const code = details.code as keyof typeof UNMATCHED_DIAGNOSTIC_REASONS
  if ((code === "no_common_time" && details.shared_time_peer_count !== 0)
    || (code === "no_feasible_combination" && (details.feasible_duo_count !== 0 || (details.multi_max_shared_peer_count as number) >= 2))) return historical
  const reasons: string[] = [UNMATCHED_DIAGNOSTIC_REASONS[code]]
  reasons.push(`原批次共 ${details.cohort_size} 人；共同时间候选 ${details.shared_time_peer_count} 人，满足硬约束的双人候选 ${details.feasible_duo_count} 人`)
  if (code === "not_selected" && details.search_mode === "bounded") reasons.push("本批采用限额搜索，未分配不代表已证明不存在可行组合")
  return reasons
}
