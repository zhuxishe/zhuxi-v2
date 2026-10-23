import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchGroupMemberNames } from "./group-members"
import { isCurrentCancellationRequest } from "@/lib/matching/cancellation-state"

const MEMBER_SELECT = `
  id,
  member_identity (full_name, nickname)
`

export async function fetchPendingCancellations() {
  await requireAdmin()
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from("match_results")
    .select(`
      id, status, publication_version, cancellation_publication_version, cancellation_reason, cancellation_requested_by,
      cancellation_requested_at, cancellation_status,
      group_members,
      session:match_sessions!inner (id, session_name, status, publication_version),
      member_a:members!match_results_member_a_id_fkey (${MEMBER_SELECT}),
      member_b:members!match_results_member_b_id_fkey (${MEMBER_SELECT})
    `)
    .eq("cancellation_status", "pending")
    .order("cancellation_requested_at", { ascending: false })

  if (error) throw error
  const rows = (data ?? []).filter(isCurrentCancellationRequest)

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
  const pageSize = 1000
  let count = 0

  // Data API limits each response; paginate the small state projection so a
  // large queue cannot silently turn into an under-counted navigation badge.
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from("match_results")
      .select("id, status, publication_version, cancellation_publication_version, cancellation_status, session:match_sessions!inner(status, publication_version)")
      .eq("cancellation_status", "pending")
      .order("id", { ascending: true })
      .range(start, start + pageSize - 1)

    // Keep the existing unavailable-count fallback, never return a partial sum.
    if (error) return 0
    const rows = data ?? []
    count += rows.filter(isCurrentCancellationRequest).length
    if (rows.length < pageSize) return count
  }
}
