import { createClient } from "@/lib/supabase/server"

const MEMBER_SELECT = `
  id, member_number,
  member_identity (full_name, nickname)
`

export async function fetchPendingCancellations() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("match_results")
    .select(`
      id, cancellation_reason, cancellation_requested_by,
      cancellation_requested_at, cancellation_status,
      session:match_sessions (id, session_name),
      member_a:members!match_results_member_a_id_fkey (${MEMBER_SELECT}),
      member_b:members!match_results_member_b_id_fkey (${MEMBER_SELECT})
    `)
    .eq("cancellation_status", "pending")
    .order("cancellation_requested_at", { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function fetchCancellationCount() {
  const supabase = await createClient()

  const { count, error } = await supabase
    .from("match_results")
    .select("id", { count: "exact", head: true })
    .eq("cancellation_status", "pending")

  if (error) return 0
  return count ?? 0
}
