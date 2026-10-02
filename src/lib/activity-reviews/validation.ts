import type { SubmitActivityReviewInput, SaveActivityReviewSettingsInput, ConfirmActivityReviewRosterInput, ModerateActivityReviewInput, ModerateActivityReportInput } from "./types"

export const REPORT_CATEGORIES = ["harassment", "privacy", "disruption", "other"] as const
export const REPORT_STATUSES = ["pending", "reviewing", "resolved", "dismissed"] as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isReviewUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value)
const length = (value: string) => Array.from(value.trim()).length
const version = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
export const validReviewReason = (value: unknown): value is string => typeof value === "string" && length(value) >= 4 && length(value) <= 500
export function validateReviewSubmission(input: SubmitActivityReviewInput): string | null {
  if (!input || !isReviewUuid(input.roundId) || !isReviewUuid(input.targetMemberId)
    || !["save", "append_report"].includes(input.operation)) return "PEER_INVALID_INPUT"
  if (input.requestId !== undefined && !isReviewUuid(input.requestId)) return "PEER_INVALID_INPUT"
  if (!input.review && !input.report) return "PEER_INVALID_INPUT"
  if (input.operation === "append_report" && (input.review || !input.report || input.report.expectedVersion < 1)) return "PEER_INVALID_INPUT"
  if (input.review) {
    const { score, comment, expectedVersion } = input.review
    if (typeof score !== "number" || !Number.isFinite(score) || score < 1 || score > 5 || !Number.isInteger(score * 2)) return "PEER_SCORE_INVALID"
    if (typeof comment !== "string" || length(comment) > 500) return "PEER_COMMENT_INVALID"
    if (!version(expectedVersion)) return "PEER_VERSION_CONFLICT"
  }
  if (input.report) {
    const { category, detail, expectedVersion } = input.report
    if (!REPORT_CATEGORIES.includes(category) || typeof detail !== "string" || length(detail) < 10 || length(detail) > 2000) return "PEER_REPORT_INVALID"
    if (!version(expectedVersion)) return "PEER_VERSION_CONFLICT"
  }
  return null
}
export function validateReviewSettings(input: SaveActivityReviewSettingsInput): string | null {
  if (!input || !isReviewUuid(input.roundId) || typeof input.enabled !== "boolean" || !version(input.expectedVersion)) return "PEER_SETTINGS_INVALID"
  if (!validReviewReason(input.reason)) return "PEER_REASON_REQUIRED"
  const start = typeof input.opensAt === "string" ? Date.parse(input.opensAt) : NaN
  const end = typeof input.closesAt === "string" ? Date.parse(input.closesAt) : NaN
  return Number.isFinite(start) && Number.isFinite(end) && start < end ? null : "PEER_SETTINGS_INVALID"
}
export function validateReviewRoster(input: ConfirmActivityReviewRosterInput): string | null {
  if (!input || !isReviewUuid(input.roundId) || !version(input.expectedVersion) || !Array.isArray(input.memberIds)
    || input.memberIds.length < 2 || input.memberIds.length > 2000 || input.memberIds.some(id => !isReviewUuid(id)) || new Set(input.memberIds).size !== input.memberIds.length) return "PEER_INVALID_INPUT"
  return validReviewReason(input.reason) ? null : "PEER_REASON_REQUIRED"
}
export function validateModerateReview(input: ModerateActivityReviewInput): string | null {
  if (!input || !isReviewUuid(input.roundId) || !isReviewUuid(input.reviewId) || typeof input.valid !== "boolean" || !version(input.expectedVersion)) return "PEER_INVALID_INPUT"
  return validReviewReason(input.reason) ? null : "PEER_REASON_REQUIRED"
}
export function validateModerateReport(input: ModerateActivityReportInput): string | null {
  if (!input || !isReviewUuid(input.roundId) || !isReviewUuid(input.reportId) || !REPORT_STATUSES.includes(input.status) || !version(input.expectedVersion)
    || typeof input.internalNote !== "string" || length(input.internalNote) < 4 || length(input.internalNote) > 2000) return "PEER_REPORT_INVALID"
  return validReviewReason(input.reason) ? null : "PEER_REASON_REQUIRED"
}
