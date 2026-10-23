import { requireAdmin } from "@/lib/auth/admin"
import { createAdminClient } from "@/lib/supabase/admin"
import { validateUuids } from "@/lib/sanitize"
import type { MatchingEligibilitySummary } from "./run-lifecycle"

const READ_ERROR = "暂时无法读取本轮资格人数，请刷新后重试"
const FORMAT_ERROR = "本轮资格人数格式异常，请刷新后重试"

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

/** Only an aggregate is returned to the administrator UI; member inputs stay server-side. */
export async function fetchMatchingEligibilitySummary(roundId: string): Promise<MatchingEligibilitySummary> {
  validateUuids([roundId])
  const admin = await requireAdmin()
  const db = createAdminClient() as unknown as {
    rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
  }
  const { data, error } = await db.rpc("admin_get_matching_eligibility_summary", {
    p_round_id: roundId,
    p_actor_admin_id: admin.id,
  })
  if (error) throw new Error(READ_ERROR)
  if (!object(data) || data.round_id !== roundId || typeof data.checked_at !== "string"
    || !Number.isFinite(Date.parse(data.checked_at)) || !count(data.submitted_count)
    || !count(data.eligible_count) || !count(data.excluded_count)
    || data.eligible_count + data.excluded_count !== data.submitted_count
    || !Array.isArray(data.exclusion_summary)) throw new Error(FORMAT_ERROR)

  const exclusionSummary = data.exclusion_summary.map((row: unknown) => {
    if (!object(row) || typeof row.reason !== "string" || !count(row.count)
      || row.count > (data.excluded_count as number)) throw new Error(FORMAT_ERROR)
    // Unknown database reason codes never expose arbitrary strings to the client.
    const safeReasons = new Set(["cancelled", "member_not_approved", "anonymized", "not_player",
      "account_unavailable", "not_current", "unbound", "profile_incomplete"])
    return { reason: safeReasons.has(row.reason) ? row.reason : "other", count: row.count }
  })
  return {
    round_id: roundId,
    checked_at: data.checked_at,
    submitted_count: data.submitted_count,
    eligible_count: data.eligible_count,
    excluded_count: data.excluded_count,
    exclusion_summary: exclusionSummary,
  }
}
