import type { PeerNoMatchRequestFilter, ResolvePeerNoMatchRequestInput } from "./admin-types"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isPeerNoMatchUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value)

export function normalizePeerNoMatchFilter(value: unknown): PeerNoMatchRequestFilter {
  return value === "all" || value === "resolved" || value === "closed" ? value : "pending"
}

export function normalizePeerNoMatchPage(value: unknown): number {
  const page = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : typeof value === "number" ? value : 1
  return Number.isSafeInteger(page) && page > 0 ? Math.min(page, 1_000_000) : 1
}

export function validateResolvePeerNoMatchRequest(input: ResolvePeerNoMatchRequestInput): string | null {
  if (!input || !isPeerNoMatchUuid(input.requestId) || !["resolved", "closed"].includes(input.status)
    || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) return "请刷新申请记录后重试。"
  if (typeof input.internalNote !== "string" || Array.from(input.internalNote.trim()).length < 4 || Array.from(input.internalNote.trim()).length > 2000) {
    return "请填写 4–2000 字的内部处理说明。"
  }
  if (typeof input.reason !== "string" || Array.from(input.reason.trim()).length < 4 || Array.from(input.reason.trim()).length > 500) {
    return "请填写 4–500 字的操作理由。"
  }
  return null
}
