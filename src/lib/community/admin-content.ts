import type {
  CommunityAdminContentFilters,
  CommunityAdminReasonCode,
  CommunityUserContentStatus,
  CommunityUserContentType,
} from "@/components/admin/community/types"
import { isCommunityRemovalReason } from "./moderation-reasons"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isValidCalendarDate(value: string | undefined): value is string {
  if (!value || !DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1) return false
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate()
}

interface CursorPayload {
  at: string
  rank: number
  id: string
}

export function parseCommunityContentFilters(raw: Record<string, string | string[] | undefined>): CommunityAdminContentFilters {
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value
  const type = first(raw.type)
  const status = first(raw.status)
  const reports = first(raw.reports)
  const anonymous = first(raw.anonymous)
  const query = first(raw.q)?.trim().slice(0, 100)
  const from = first(raw.from)
  const to = first(raw.to)
  const cursor = first(raw.cursor)

  return {
    type: ["treehole", "photo", "comment", "reply"].includes(type ?? "") ? type as CommunityUserContentType : undefined,
    status: ["published", "hidden", "deleted"].includes(status ?? "") ? status as CommunityUserContentStatus : undefined,
    reports: ["pending", "any", "none"].includes(reports ?? "") ? reports as CommunityAdminContentFilters["reports"] : undefined,
    anonymous: anonymous === "yes" ? true : anonymous === "no" ? false : undefined,
    query: query || undefined,
    from: isValidCalendarDate(from) ? from : undefined,
    to: isValidCalendarDate(to) ? to : undefined,
    cursor: decodeCommunityContentCursor(cursor) ? cursor : undefined,
  }
}

export function jstStart(value: string | undefined) {
  if (!isValidCalendarDate(value)) return null
  const date = new Date(`${value}T00:00:00+09:00`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function jstEndExclusive(value: string | undefined) {
  const start = jstStart(value)
  if (!start) return null
  return new Date(new Date(start).getTime() + 86_400_000).toISOString()
}

export function encodeCommunityContentCursor(payload: CursorPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
}

export function decodeCommunityContentCursor(value: string | undefined): CursorPayload | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<CursorPayload>
    if (typeof parsed.at !== "string" || Number.isNaN(new Date(parsed.at).getTime())) return null
    const rank = parsed.rank
    if (!Number.isInteger(rank) || ![1, 2].includes(rank!)) return null
    if (typeof parsed.id !== "string" || !UUID_PATTERN.test(parsed.id)) return null
    return { at: parsed.at, rank: rank!, id: parsed.id }
  } catch {
    return null
  }
}

export interface CommunityAdminModerationInput {
  targetType: "post" | "comment"
  targetId: string
  postId: string
  status: CommunityUserContentStatus
  reasonCode: CommunityAdminReasonCode
  internalNote?: string
}

export function validateCommunityAdminModerationInput(input: CommunityAdminModerationInput) {
  if (
    !["post", "comment"].includes(input.targetType)
    || !UUID_PATTERN.test(input.targetId)
    || !UUID_PATTERN.test(input.postId)
  ) {
    return "内容标识无效"
  }
  if (!["published", "hidden", "deleted"].includes(input.status)) return "目标状态无效"
  if (input.status === "published" && input.reasonCode !== "reviewed_restore") return "恢复操作的原因无效"
  if (input.status !== "published" && !isCommunityRemovalReason(input.reasonCode)) return "请选择处理原因"
  if ((input.internalNote?.trim().length ?? 0) > 2000) return "内部备注不能超过 2,000 个字符"
  return null
}
