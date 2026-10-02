import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAdmin } from "@/lib/auth/admin"
import { getSingleRelation } from "@/lib/supabase/relations"
import { emptyReviewContext, mapAdminReviewContext, mapAdminReviewEvent, mapReviewContext, mapReviewRound, record, rows } from "./mappers"
import { isReviewUuid } from "./validation"
import type { ActivityReviewContext, ActivityReviewRound, AdminActivityReviewEvent, AdminActivityReviewsData } from "./types"

interface RpcClient { rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }> }
export class ActivityReviewError extends Error { constructor(public code: string) { super(code) } }
export function activityReviewErrorCode(error: unknown) {
  const value = error instanceof Error ? error.message : String(record(error).message ?? "")
  return value.match(/\bPEER_[A-Z_]+\b/)?.[0] ?? "PEER_SAVE_FAILED"
}
export async function activityReviewRpc(name: string, args?: Record<string, unknown>): Promise<unknown> {
  const client = await createClient()
  const { data, error } = await (client as unknown as RpcClient).rpc(name, args)
  if (error) {
    if (["PGRST202", "42883"].includes(error.code ?? "")) throw new ActivityReviewError("PEER_UNAVAILABLE")
    throw new ActivityReviewError(activityReviewErrorCode(error))
  }
  return data
}
export async function fetchMyActivityReviewRounds(): Promise<ActivityReviewRound[]> {
  try { return rows(record(await activityReviewRpc("player_list_round_peer_review_events")).events).map(mapReviewRound) }
  catch (error) {
    if (["PEER_UNAVAILABLE", "PEER_AUTH_REQUIRED", "PEER_NOT_ELIGIBLE"].includes(activityReviewErrorCode(error))) return []
    throw error
  }
}
export async function fetchAdminActivityReviewRoundSummary(roundId: string): Promise<AdminActivityReviewEvent | null> {
  await requireAdmin()
  if (!isReviewUuid(roundId)) return null
  try {
    return rows(record(await activityReviewRpc("admin_list_round_peer_review_events")).events).map(mapAdminReviewEvent).find(event => event.roundId === roundId) ?? null
  } catch (error) {
    if (activityReviewErrorCode(error) === "PEER_UNAVAILABLE") return null
    throw error
  }
}
export async function fetchActivityReviewContext(roundId: string, search = "", page = 1): Promise<ActivityReviewContext> {
  if (!isReviewUuid(roundId)) return emptyReviewContext(roundId)
  try {
    const value = await activityReviewRpc("player_get_round_peer_reviews", { p_round_id: roundId, p_search: search.trim().slice(0, 100), p_page: Number.isSafeInteger(page) && page > 0 ? page : 1, p_page_size: 24 })
    return mapReviewContext(value, search)
  } catch (error) {
    const code = activityReviewErrorCode(error)
    if (["PEER_UNAVAILABLE", "PEER_AUTH_REQUIRED", "PEER_NOT_ELIGIBLE", "PEER_ROUND_NOT_FOUND"].includes(code)) return emptyReviewContext(roundId, code === "PEER_UNAVAILABLE")
    throw error
  }
}
export async function fetchAdminActivityReviews(params: { roundId?: string; memberId?: string } = {}): Promise<AdminActivityReviewsData> {
  await requireAdmin()
  const empty: AdminActivityReviewsData = { events: [], context: null, memberOptions: [], setupRequired: false, memberFilter: isReviewUuid(params.memberId) ? params.memberId : null }
  try {
    const events = rows(record(await activityReviewRpc("admin_list_round_peer_review_events")).events).map(mapAdminReviewEvent)
    const roundId = isReviewUuid(params.roundId) ? params.roundId : events[0]?.roundId
    if (!roundId) return { ...empty, events }
    const context = mapAdminReviewContext(await activityReviewRpc("admin_get_round_peer_reviews", { p_round_id: roundId }))
    const memberOptions: AdminActivityReviewsData["memberOptions"] = []
    const db = createAdminClient()
    for (let start = 0; ; start += 500) {
      const { data, error } = await db.from("members").select("id,member_identity(full_name,nickname)")
        .eq("record_scope", "current").eq("account_status", "active").eq("status", "approved")
        .eq("membership_type", "player").is("anonymized_at", null).order("id").range(start, start + 499)
      if (error) throw new ActivityReviewError("PEER_MEMBER_LOOKUP_FAILED")
      for (const member of data ?? []) {
        const identity = getSingleRelation(member.member_identity)
        memberOptions.push({ memberId: member.id, fullName: identity?.full_name ?? "", nickname: identity?.nickname ?? null })
      }
      if (!data || data.length < 500) break
    }
    return { ...empty, events, context, memberOptions }
  } catch (error) {
    if (activityReviewErrorCode(error) === "PEER_UNAVAILABLE") return { ...empty, setupRequired: true }
    throw error
  }
}
