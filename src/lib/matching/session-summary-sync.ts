import type { SupabaseClient } from "@supabase/supabase-js"
import { buildSessionSummary } from "./session-summary"
import { getMatchMemberIds } from "./member-conflicts"

export async function syncSessionSummary(
  db: SupabaseClient<any, any, any>,
  sessionId: string,
  auditReason: string,
) {
  const [{ error: sessionError }, { data: results, error: resultsError }, { data: diagnostics, error: diagnosticsError }] = await Promise.all([
    db.from("match_sessions").select("total_candidates").eq("id", sessionId).single(),
    db.from("match_results").select("status, member_a_id, member_b_id, group_members").eq("session_id", sessionId),
    db.from("unmatched_diagnostics").select("member_id").eq("session_id", sessionId),
  ])

  if (sessionError) throw sessionError
  if (resultsError) throw resultsError
  if (diagnosticsError) throw diagnosticsError
  // A manual pair can add a later respondent to this saved batch. Keep its
  // roster count consistent with persisted results/diagnostics, never with
  // every current survey respondent or just the original algorithm count.
  const memberIds = new Set<string>([
    ...(results ?? []).flatMap(getMatchMemberIds),
    ...(diagnostics ?? []).map((row: { member_id: string }) => row.member_id),
  ])
  const summary = buildSessionSummary(memberIds.size, results ?? [])

  const { error: updateError } = await db
    .from("match_sessions")
    .update({
      total_candidates: memberIds.size,
      total_matched: summary.totalMatched,
      total_unmatched: summary.totalUnmatched,
      audit_reason: auditReason,
    })
    .eq("id", sessionId)

  if (updateError) throw updateError
}
