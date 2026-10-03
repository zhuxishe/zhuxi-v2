import type { ActivityReview, ActivityReport, ActivityReviewSettings, ActivityReviewStatus, ActivityReviewContext, ActivityReviewRound, AdminActivityReviewContext, AdminActivityReviewMember, AdminActivityReviewEvent, ActivityReportCategory, ActivityReportStatus } from "./types"
export type JsonRecord = Record<string, unknown>
export function record(value: unknown): JsonRecord { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {} }
export function rows(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.map(record) : [] }
const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback
const nullable = (value: unknown) => typeof value === "string" ? value : null
const number = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback
export function mapReviewSettings(value: unknown): ActivityReviewSettings {
  const r = record(value)
  return { enabled: r.enabled === true, opensAt: nullable(r.opens_at), closesAt: nullable(r.closes_at), openedAt: nullable(r.opened_at), rosterConfirmed: r.roster_confirmed === true, version: number(r.version) }
}
export function reviewWindowStatus(s: ActivityReviewSettings, now = Date.now()): ActivityReviewStatus {
  if (!s.enabled) return s.openedAt ? "paused" : "unavailable"
  if (!s.rosterConfirmed || !s.opensAt || !s.closesAt) return "unavailable"
  if (now < Date.parse(s.opensAt)) return "scheduled"
  return now < Date.parse(s.closesAt) ? "open" : "closed"
}
export function mapActivityReview(value: unknown): ActivityReview {
  const r = record(value)
  return { id: text(r.id), reviewerId: nullable(r.reviewer_id) ?? undefined, revieweeId: text(r.reviewee_id), score: number(r.score), comment: text(r.comment), version: number(r.version), valid: r.valid !== false, updatedAt: text(r.updated_at), createdAt: nullable(r.created_at) ?? undefined }
}
export function mapActivityReport(value: unknown, admin = false): ActivityReport {
  const r = record(value)
  const result: ActivityReport = { id: text(r.id), revieweeId: text(r.reviewee_id), category: text(r.category, "other") as ActivityReportCategory, detail: text(r.details), status: text(r.status, "pending") as ActivityReportStatus, version: number(r.version), createdAt: text(r.created_at ?? r.updated_at), updatedAt: text(r.updated_at), supplements: rows(r.supplements).map(s => ({ detail: text(s.detail), createdAt: text(s.created_at) })) }
  // Never pass moderation-only data through the player's response, even if an RPC regresses.
  if (admin) { result.reporterId = nullable(r.reporter_id) ?? undefined; result.internalNote = text(r.internal_note) }
  return result
}
export function mapReviewRound(value: unknown): ActivityReviewRound {
  const r = record(value), settings = mapReviewSettings(r.settings ?? { ...r, roster_confirmed: true })
  return { roundId: text(r.round_id), title: text(r.round_name), status: reviewWindowStatus(settings), opensAt: settings.opensAt, closesAt: settings.closesAt, reviewedCount: number(r.reviewed_count), hasSubmittedFeedback: r.has_submitted_feedback === true || number(r.reviewed_count) > 0, participantCount: number(r.participant_count), canReview: r.can_review === true, canReport: r.can_report === true }
}
export function mapReviewContext(value: unknown, search = ""): ActivityReviewContext {
  const r = record(value), settings = mapReviewSettings(r.settings)
  const reviews = rows(r.reviews).map(mapActivityReview), reports = rows(r.reports).map(item => mapActivityReport(item))
  return { ...mapReviewRound(r), hasSubmittedFeedback: reviews.length > 0 || reports.length > 0, settings, eligible: r.eligible === true, ownReviews: reviews, ownReports: reports,
    ...(Array.isArray(r.history_targets) ? { historyTargets: rows(r.history_targets).map(p => ({ memberId: text(p.member_id), fullName: text(p.full_name), nickname: nullable(p.nickname), canReview: p.can_review === true, canReport: p.can_report === true })) } : {}),
    search, total: number(r.total), page: number(r.page, 1), pageSize: number(r.page_size, 24), participants: rows(r.participants).map(p => ({ memberId: text(p.member_id), fullName: text(p.full_name), nickname: nullable(p.nickname), review: reviews.find(v => v.revieweeId === p.member_id) ?? null, report: reports.find(v => v.revieweeId === p.member_id) ?? null })) }
}
export function emptyReviewContext(roundId: string, setupRequired = false): ActivityReviewContext {
  return { ...mapReviewContext({ round_id: roundId }), eligible: false, setupRequired }
}
function mapMember(r: JsonRecord): AdminActivityReviewMember {
  return { memberId: text(r.member_id), fullName: text(r.full_name), nickname: nullable(r.nickname), source: text(r.source, "registered"), included: r.included === true, eligible: r.eligible === true, registered: r.registered === true || r.source === "registered" }
}
export function mapAdminReviewContext(value: unknown): AdminActivityReviewContext {
  const r = record(value)
  return { roundId: text(r.round_id), title: text(r.round_name), settings: mapReviewSettings(r.settings), participants: rows(r.participants).map(mapMember), candidates: rows(r.candidates).map(mapMember), reviews: rows(r.reviews).map(mapActivityReview), reports: rows(r.reports).map(item => mapActivityReport(item, true)), canManageSettings: true, canModerateReports: true, audit: rows(r.audit).map(a => ({ id: String(a.id ?? ""), action: text(a.action), actorId: nullable(a.actor_admin_id ?? a.actor_member_id), actorKind: a.actor_admin_id ? "admin" : a.actor_member_id ? "player" : "system", reason: text(a.reason), createdAt: text(a.created_at), reviewId: text(a.action).startsWith("review_") ? nullable(a.subject_id) : null, reportId: text(a.action).startsWith("report_") ? nullable(a.subject_id) : null, details: { before: a.before_values, after: a.after_values } })) }
}
export function mapAdminReviewEvent(value: unknown): AdminActivityReviewEvent {
  const r = record(value)
  return { ...mapReviewRound(r), settings: mapReviewSettings(r.settings), reviewCount: number(r.review_count), pendingReportCount: number(r.pending_report_count) }
}
