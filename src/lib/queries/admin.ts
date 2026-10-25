import { requireAdmin } from "@/lib/auth/admin"
import { createAdminClient } from "@/lib/supabase/admin"
import { fetchPendingApplicationCount } from "@/lib/queries/pending-applications"

export async function fetchDashboardStats() {
  await requireAdmin()
  const supabase = createAdminClient()

  const [
    { count: totalMembers },
    pendingMembers,
    { count: approvedMembers },
    { count: rejectedMembers },
  ] = await Promise.all([
    supabase.from("members").select("id", { count: "exact", head: true }).eq("record_scope", "current").eq("account_status", "active").eq("is_test", false),
    fetchPendingApplicationCount(),
    supabase.from("members").select("id", { count: "exact", head: true }).eq("record_scope", "current").eq("account_status", "active").eq("is_test", false).eq("status", "approved"),
    supabase.from("members").select("id", { count: "exact", head: true }).eq("record_scope", "current").eq("account_status", "active").eq("is_test", false).eq("status", "rejected"),
  ])

  return {
    total: totalMembers ?? 0,
    pending: pendingMembers ?? 0,
    approved: approvedMembers ?? 0,
    rejected: rejectedMembers ?? 0,
  }
}
