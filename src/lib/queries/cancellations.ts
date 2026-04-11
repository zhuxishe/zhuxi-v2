import { createClient } from "@/lib/supabase/server"
import { fetchGroupMemberNames } from "./group-members"

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
      group_members,
      session:match_sessions (id, session_name),
      member_a:members!match_results_member_a_id_fkey (${MEMBER_SELECT}),
      member_b:members!match_results_member_b_id_fkey (${MEMBER_SELECT})
    `)
    .eq("cancellation_status", "pending")
    .order("cancellation_requested_at", { ascending: false })

  if (error) throw error
  const rows = data ?? []

  // 批量解析组匹配的成员名字
  const allGroupIds = new Set<string>()
  for (const r of rows) {
    const gm = r.group_members as string[] | null
    if (Array.isArray(gm)) gm.forEach((id) => allGroupIds.add(id))
  }
  const groupNames = await fetchGroupMemberNames([...allGroupIds])
  const nameMap = new Map(groupNames.map((g) => [g.id, g.name]))

  return rows.map((r) => {
    const gm = r.group_members as string[] | null
    const isGroup = Array.isArray(gm) && gm.length > 0
    return {
      ...r,
      group_member_names: isGroup ? gm.map((id) => nameMap.get(id) ?? "未知") : null,
    }
  })
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
