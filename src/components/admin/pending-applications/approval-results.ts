import type { PendingApplicationApprovalResult as ApprovalResult } from "@/types/pending-applications"
export type { PendingApplicationApprovalResult as ApprovalResult } from "@/types/pending-applications"

/** Preserve successful approvals when only the failed requests are retried. */
export function mergeApprovalResults(
  targetIds: string[],
  previous: ApprovalResult[],
  incoming: ApprovalResult[],
): ApprovalResult[] {
  const prior = new Map(previous.map((result) => [result.id, result]))
  const received = new Map(incoming.map((result) => [result.id, result]))
  return targetIds.map((id) => {
    if (prior.get(id)?.success) return prior.get(id)!
    return received.get(id) ?? { id, success: false, error: "未收到处理结果，请重试核对" }
  })
}

export function approvalRetryIds(targetIds: string[], results: ApprovalResult[]): string[] {
  const succeeded = new Set(results.filter((result) => result.success).map((result) => result.id))
  return targetIds.filter((id) => !succeeded.has(id))
}
