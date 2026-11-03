import { unmatchedDiagnosticMessages } from "./unmatched-diagnostic-display"

interface Options {
  placement?: "waiting_duo" | "waiting_multi" | "unmatched"
  anonymized?: boolean
  cancelled?: boolean
}

/** Describe saved evidence and current placement, never infer a cause from current questionnaires. */
export function exportUnmatchedReason(diagnostic: unknown, options: Options = {}): string {
  if (options.anonymized) return "成员已注销，不提供诊断信息"
  if (options.placement === "waiting_duo") return "待双人搭档：尚未完成配对，并非已判定无法匹配"
  if (options.placement === "waiting_multi") return "待多人分组：尚未确认所属小组，并非已判定无法匹配"
  const row = diagnostic && typeof diagnostic === "object" && !Array.isArray(diagnostic)
    ? diagnostic as Record<string, unknown> : null
  const details = row?.details && typeof row.details === "object" && !Array.isArray(row.details)
    ? row.details as Record<string, unknown> : null
  if (details?.stage === "manual_board") return "人工调整后暂未安排，未保存具体的算法排除原因"
  const messages = unmatchedDiagnosticMessages(details)
  if (!messages[0].startsWith("历史记录未保存详细原因")) return messages.join("\n")
  // Preserve a human-readable legacy record as a record, not a new diagnosis.
  if (row && typeof row.reason === "string" && /[\u3400-\u9fff]/.test(row.reason)) {
    return `已保存的历史原因：${row.reason.trim()}\n历史记录未保存详细诊断，不能据此判断当前是否仍无法匹配`
  }
  return `${options.cancelled ? "原配对已取消，当前尚未安排；" : ""}未保存具体未匹配原因，无法据此判断`
}

export function exportUnmatchedReasons(diagnostics: readonly unknown[], options: Options = {}): string {
  if (options.anonymized || options.placement === "waiting_duo" || options.placement === "waiting_multi") return exportUnmatchedReason(undefined, options)
  const messages = [...new Set(diagnostics.map((row) => exportUnmatchedReason(row, options)))]
  if (!messages.length) return exportUnmatchedReason(undefined, options)
  if (messages.length === 1) return messages[0]
  return `已保存多条诊断记录，请核对：\n${messages.map((message, index) => `${index + 1}. ${message}`).join("\n")}`
}
