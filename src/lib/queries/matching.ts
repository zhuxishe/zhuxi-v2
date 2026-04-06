import { createClient } from "@/lib/supabase/server"

export async function fetchMatchSessions() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("match_sessions")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function fetchMatchSession(id: string) {
  const supabase = await createClient()

  const { data: session, error: sErr } = await supabase
    .from("match_sessions")
    .select("*")
    .eq("id", id)
    .single()

  if (sErr) throw sErr

  const { data: results, error: rErr } = await supabase
    .from("match_results")
    .select(`
      *,
      member_a:members!match_results_member_a_id_fkey (
        id, member_number,
        member_identity (full_name, nickname, school_name)
      ),
      member_b:members!match_results_member_b_id_fkey (
        id, member_number,
        member_identity (full_name, nickname, school_name)
      )
    `)
    .eq("session_id", id)
    .order("rank", { ascending: true })

  if (rErr) throw rErr

  return { session, results: results ?? [] }
}

export async function fetchMatchCandidates() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("members")
    .select(`
      id, member_number, status, attractiveness_score, membership_type,
      member_identity (*),
      member_interests (*),
      member_personality (*),
      member_language (*),
      member_boundaries (*),
      member_dynamic_stats (activity_count, late_count, no_show_count, replay_willing_rate, reliability_score)
    `)
    .eq("status", "approved")
    .eq("membership_type", "player")

  if (error) throw error
  return data ?? []
}

/** Fetch past match history for all candidates (for repeat penalty) */
export async function fetchMatchHistory(memberIds: string[]) {
  if (memberIds.length === 0) return new Map<string, { name: string; count: number }[]>()

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("match_results")
    .select("member_a_id, member_b_id")

  if (error) throw error

  // Build history map: memberId → [{name: partnerId, count}]
  const historyMap = new Map<string, Map<string, number>>()
  for (const row of data ?? []) {
    const a = row.member_a_id as string
    const b = row.member_b_id as string
    if (!historyMap.has(a)) historyMap.set(a, new Map())
    if (!historyMap.has(b)) historyMap.set(b, new Map())
    historyMap.get(a)!.set(b, (historyMap.get(a)!.get(b) ?? 0) + 1)
    historyMap.get(b)!.set(a, (historyMap.get(b)!.get(a) ?? 0) + 1)
  }

  const result = new Map<string, { name: string; count: number }[]>()
  for (const [mid, partners] of historyMap) {
    result.set(mid, Array.from(partners, ([name, count]) => ({ name, count })))
  }
  return result
}

export async function fetchPlayerMatches(memberId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("match_results")
    .select(`
      id, total_score, best_slot, rank, created_at,
      session:match_sessions (id, session_name, created_at),
      member_a:members!match_results_member_a_id_fkey (
        id, member_identity (full_name, nickname)
      ),
      member_b:members!match_results_member_b_id_fkey (
        id, member_identity (full_name, nickname)
      )
    `)
    .or(`member_a_id.eq.${memberId},member_b_id.eq.${memberId}`)
    .order("created_at", { ascending: false })

  if (error) throw error
  return data ?? []
}
