import { requireAdmin } from "@/lib/auth/admin"
import { createAdminClient } from "@/lib/supabase/admin"
import { getSingleRelation } from "@/lib/supabase/relations"

export async function fetchMemberBriefList() {
  await requireAdmin()
  const supabase = createAdminClient()
  const { data } = await supabase
    .from("members")
    .select("id, member_identity(full_name)")
    .eq("record_scope", "current")
    .eq("account_status", "active")
    .eq("status", "approved")
    .order("created_at", { ascending: false })
  return (data ?? []).map((m) => {
    const identity = getSingleRelation(
      m.member_identity as { full_name?: string } | { full_name?: string }[] | null
    )
    return {
      id: m.id,
      name: identity?.full_name ?? m.id,
    }
  })
}
