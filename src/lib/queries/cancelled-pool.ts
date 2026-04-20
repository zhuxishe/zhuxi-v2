import { createClient } from "@/lib/supabase/server"

export async function fetchCancelledPoolIds(sessionId: string) {
  const supabase = await createClient()
  const { data: cancelled, error } = await supabase
    .from("match_results")
    .select("member_a_id, member_b_id, group_members")
    .eq("session_id", sessionId)
    .eq("status", "cancelled")

  if (error) throw error
  if (!cancelled?.length) return []

  const cancelledIds = new Set<string>()
  for (const row of cancelled) {
    if (row.member_a_id) cancelledIds.add(row.member_a_id)
    if (row.member_b_id) cancelledIds.add(row.member_b_id)
    if (Array.isArray(row.group_members)) {
      for (const memberId of row.group_members) cancelledIds.add(memberId as string)
    }
  }

  const { data: active, error: activeError } = await supabase
    .from("match_results")
    .select("member_a_id, member_b_id, group_members")
    .eq("session_id", sessionId)
    .neq("status", "cancelled")

  if (activeError) throw activeError

  const activeIds = new Set<string>()
  for (const row of active ?? []) {
    if (row.member_a_id) activeIds.add(row.member_a_id)
    if (row.member_b_id) activeIds.add(row.member_b_id)
    if (Array.isArray(row.group_members)) {
      for (const memberId of row.group_members) activeIds.add(memberId as string)
    }
  }

  return [...cancelledIds].filter((id) => !activeIds.has(id))
}
