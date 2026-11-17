import { requireAdmin } from "@/lib/auth/admin"
import { createClient } from "@/lib/supabase/server"
import type { MemberPeerScore, MemberPeerScoreResult, MemberPeerScoreReview, MemberPeerScoreSource } from "@/types/member-peer-score"

const RPC_NAME = "admin_get_member_peer_score"
const INVALID_DATA = "长期合拍分试算数据格式无效"

interface PeerScoreRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{
    data: unknown
    error: { code?: string; message: string } | null
  }>
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(INVALID_DATA)
  return value as Record<string, unknown>
}

function text(value: unknown, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) throw new Error(INVALID_DATA)
  return value
}

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(INVALID_DATA)
  return value
}

function score(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1 || value > 5) throw new Error(INVALID_DATA)
  return value
}

function review(value: unknown): MemberPeerScoreReview {
  const item = record(value)
  const updatedAt = text(item.updated_at)
  if (!Number.isFinite(Date.parse(updatedAt))) throw new Error(INVALID_DATA)
  return {
    review_id: text(item.review_id), round_id: text(item.round_id), round_name: text(item.round_name, true),
    score: score(item.score), updated_at: updatedAt,
  }
}

function source(value: unknown): MemberPeerScoreSource {
  const item = record(value)
  if (!Array.isArray(item.reviews)) throw new Error(INVALID_DATA)
  const result = {
    reviewer_id: text(item.reviewer_id), reviewer_name: text(item.reviewer_name, true), score: score(item.score),
    review_count: count(item.review_count), activity_count: count(item.activity_count), reviews: item.reviews.map(review),
  }
  if (result.review_count !== result.reviews.length || result.activity_count < 1 || result.activity_count > result.review_count) {
    throw new Error(INVALID_DATA)
  }
  return result
}

/** Validate the display contract; all aggregation and eligibility decisions stay in the database. */
export function normalizeMemberPeerScore(value: unknown, memberId: string): MemberPeerScore {
  const item = record(value)
  if (!Array.isArray(item.sources) || typeof item.eligible_for_publication !== "boolean") throw new Error(INVALID_DATA)
  const result: MemberPeerScore = {
    member_id: text(item.member_id), score: item.score === null ? null : score(item.score),
    reviewer_count: count(item.reviewer_count), activity_count: count(item.activity_count), review_count: count(item.review_count),
    eligible_for_publication: item.eligible_for_publication, sources: item.sources.map(source),
  }
  if (result.member_id !== memberId || result.reviewer_count !== result.sources.length
    || result.activity_count > result.review_count || result.reviewer_count > result.review_count
    || (result.review_count === 0 && (result.score !== null || result.activity_count !== 0 || result.reviewer_count !== 0 || result.eligible_for_publication))
    || (result.review_count > 0 && (result.score === null || result.activity_count === 0 || result.reviewer_count === 0))) {
    throw new Error(INVALID_DATA)
  }
  return result
}

export async function fetchMemberPeerScore(memberId: string): Promise<MemberPeerScoreResult> {
  await requireAdmin()
  const client = await createClient() as unknown as PeerScoreRpcClient
  const { data, error } = await client.rpc(RPC_NAME, { p_member_id: memberId })
  if (error) {
    // Only the missing entry point is an undeployed feature. Errors inside an
    // installed function, denied access and network failures remain failures.
    if (["PGRST202", "42883"].includes(error.code ?? "") && error.message.includes(RPC_NAME)) {
      return { status: "unavailable" }
    }
    throw new Error(`长期合拍分试算读取失败：${error.message}`)
  }
  return { status: "ready", data: normalizeMemberPeerScore(data, memberId) }
}
