import { requireSuperAdmin } from "@/lib/auth/admin"
import { createClient } from "@/lib/supabase/server"
import { isReviewUuid } from "@/lib/activity-reviews/validation"
import type { MemberPeerScoreDetail, MemberPeerScoreDetailFilters, MemberPeerScoreDetailResult, PeerScoreDetailActivity, PeerScoreDetailReview, PeerScoreDetailReviewer } from "@/types/member-peer-score-detail"

const RPC = "admin_get_member_peer_score_detail"
const INVALID = "合拍分数详情数据格式无效"
interface Client {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(INVALID)
  return value as Record<string, unknown>
}
function list(value: unknown): unknown[] { if (!Array.isArray(value)) throw new Error(INVALID); return value }
function text(value: unknown): string { if (typeof value !== "string") throw new Error(INVALID); return value }
function nullableText(value: unknown): string | null { return value === null || value === undefined ? null : text(value) }
function uuid(value: unknown): string { if (!isReviewUuid(value)) throw new Error(INVALID); return value }
function optionalUuid(value: unknown): string | null { return value === null || value === undefined ? null : uuid(value) }
function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(INVALID)
  return value
}
function score(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1 || value > 5) throw new Error(INVALID)
  return value
}
function nullableScore(value: unknown): number | null { return value === null ? null : score(value) }
function date(value: unknown): string {
  const result = text(value)
  if (!Number.isFinite(Date.parse(result))) throw new Error(INVALID)
  return result
}
function optionalDate(value: unknown): string | null { return value === null || value === undefined ? null : date(value) }
function bool(value: unknown): boolean { if (typeof value !== "boolean") throw new Error(INVALID); return value }
function choice<T extends string>(value: unknown, options: readonly T[]): T {
  if (typeof value !== "string" || !options.includes(value as T)) throw new Error(INVALID)
  return value as T
}

export function parseMemberPeerScoreDetailFilters(query: Record<string, string | string[] | undefined>): MemberPeerScoreDetailFilters {
  const rawPage = typeof query.page === "string" ? Number(query.page) : 1
  return {
    validity: query.validity === "invalid" || query.validity === "all" ? query.validity : "valid",
    roundId: isReviewUuid(query.roundId) ? query.roundId : null,
    page: Number.isSafeInteger(rawPage) && rawPage >= 1 && rawPage <= 1_000_000 ? rawPage : 1,
    pageSize: 20,
  }
}

function reviewer(value: unknown): PeerScoreDetailReviewer {
  const row = record(value)
  return { reviewerId: uuid(row.reviewer_id), name: text(row.reviewer_name), nickname: nullableText(row.reviewer_nickname),
    score: score(row.score), reviewCount: count(row.review_count), activityCount: count(row.activity_count), latestReviewAt: optionalDate(row.latest_review_at) }
}
function activity(value: unknown): PeerScoreDetailActivity {
  const row = record(value)
  return { roundId: uuid(row.round_id), name: text(row.round_name), activityStart: optionalDate(row.activity_start), activityEnd: optionalDate(row.activity_end),
    reviewCount: count(row.review_count), invalidReviewCount: count(row.invalid_review_count), reviewerCount: count(row.reviewer_count), averageScore: nullableScore(row.average_score),
    registrationStatus: choice(row.registration_status, ["active", "cancelled", "none"] as const), inReviewRoster: bool(row.in_review_roster),
    rosterIncluded: row.roster_included === null ? null : bool(row.roster_included), rosterSource: row.roster_source === null ? null : choice(row.roster_source, ["registered", "manual"] as const) }
}
function review(value: unknown): PeerScoreDetailReview {
  const row = record(value)
  return { reviewId: uuid(row.review_id), roundId: uuid(row.round_id), roundName: text(row.round_name),
    activityStart: optionalDate(row.activity_start), activityEnd: optionalDate(row.activity_end),
    reviewerId: uuid(row.reviewer_id), reviewerName: text(row.reviewer_name), reviewerNickname: nullableText(row.reviewer_nickname),
    score: score(row.score), comment: text(row.comment), valid: bool(row.valid), createdAt: date(row.created_at), updatedAt: date(row.updated_at),
    invalidationReason: nullableText(row.latest_invalidation_reason), invalidatedAt: optionalDate(row.invalidated_at) }
}

/** Copy only approved fields. Report payloads are never part of this display contract. */
export function normalizeMemberPeerScoreDetail(value: unknown, memberId: string): MemberPeerScoreDetail {
  const row = record(value), member = record(row.member), summary = record(row.summary)
  const operational = row.operational_score === null ? null : record(row.operational_score)
  const canViewMemberNumber = bool(row.can_view_member_number)
  const data: MemberPeerScoreDetail = {
    member: { id: uuid(member.member_id), name: text(member.full_name), nickname: nullableText(member.nickname), memberNumber: canViewMemberNumber ? nullableText(member.member_number) : null },
    summary: { score: nullableScore(summary.score), reviewerCount: count(summary.reviewer_count), activityCount: count(summary.activity_count), reviewCount: count(summary.review_count),
      eligibleForPublication: bool(summary.eligible_for_publication), latestReviewAt: optionalDate(summary.latest_review_at), sampleStatus: choice(summary.sample_status, ["unrated", "accumulating", "ready"] as const) },
    operationalScore: operational ? { score: nullableScore(operational.score), status: choice(operational.status, ["pending", "published"] as const), source: choice(operational.source, ["initial", "manual"] as const),
      internalNote: nullableText(operational.internal_note), publishedAt: optionalDate(operational.published_at), updatedAt: optionalDate(operational.updated_at),
      publishedByName: nullableText(operational.published_by_name), updatedByName: nullableText(operational.updated_by_name) } : null,
    reviewers: list(row.reviewer_summaries).map(reviewer), activities: list(row.activity_summaries).map(activity), reviews: list(row.reviews).map(review),
    total: count(row.total), filters: { validity: choice(row.validity, ["valid", "invalid", "all"] as const), roundId: optionalUuid(row.round_id), page: count(row.page), pageSize: count(row.page_size) }, canViewMemberNumber,
  }
  const { filters, summary: stats } = data
  if (data.member.id !== memberId || filters.page < 1 || filters.pageSize < 1 || filters.pageSize > 100 || data.reviews.length > filters.pageSize
    || data.total < data.reviews.length || stats.reviewerCount !== data.reviewers.length
    || (stats.reviewCount === 0 && (stats.score !== null || stats.reviewerCount !== 0 || stats.activityCount !== 0 || stats.eligibleForPublication || stats.sampleStatus !== "unrated"))
    || (stats.reviewCount > 0 && (stats.score === null || stats.reviewerCount === 0 || stats.activityCount === 0 || stats.sampleStatus === "unrated"))
    || data.reviews.some(item => (filters.roundId !== null && item.roundId !== filters.roundId) || (filters.validity !== "all" && item.valid !== (filters.validity === "valid")))) {
    throw new Error(INVALID)
  }
  return data
}

export async function fetchMemberPeerScoreDetail(memberId: string, filters: MemberPeerScoreDetailFilters): Promise<MemberPeerScoreDetailResult> {
  await requireSuperAdmin()
  if (!isReviewUuid(memberId)) return { status: "not_found" }
  if (!["valid", "invalid", "all"].includes(filters.validity) || (filters.roundId !== null && !isReviewUuid(filters.roundId))
    || !Number.isSafeInteger(filters.page) || filters.page < 1 || filters.page > 1_000_000 || !Number.isSafeInteger(filters.pageSize) || filters.pageSize < 1 || filters.pageSize > 100) {
    throw new Error("合拍分数详情筛选条件无效")
  }
  const client = await createClient() as unknown as Client
  const { data, error } = await client.rpc(RPC, { p_member_id: memberId, p_validity: filters.validity, p_round_id: filters.roundId, p_page: filters.page, p_page_size: filters.pageSize })
  if (error) {
    if (error.message.includes("PEER_DIRECTORY_MEMBER_NOT_FOUND")) return { status: "not_found" }
    if (["PGRST202", "42883"].includes(error.code ?? "") && error.message.includes(RPC)) return { status: "unavailable" }
    throw new Error("合拍分数详情读取失败", { cause: error })
  }
  const normalized = normalizeMemberPeerScoreDetail(data, memberId)
  if (normalized.filters.page !== filters.page || normalized.filters.pageSize !== filters.pageSize || normalized.filters.validity !== filters.validity || normalized.filters.roundId !== filters.roundId) throw new Error(INVALID)
  return { status: "ready", data: normalized }
}
