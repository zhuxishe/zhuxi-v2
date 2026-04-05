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
      id, member_number, status, attractiveness_score,
      member_identity (*),
      member_interests (*),
      member_personality (*)
    `)
    .eq("status", "approved")

  if (error) throw error
  return data ?? []
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
