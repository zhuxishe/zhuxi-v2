import { requireAdmin } from "@/lib/auth/admin"
import { createAdminClient } from "@/lib/supabase/admin"

export async function fetchDashboardStats() {
  await requireAdmin()
  const supabase = createAdminClient()

  const [
    { count: totalMembers },
    { count: pendingMembers },
    { count: approvedMembers },
    { count: rejectedMembers },
  ] = await Promise.all([
    supabase.from("members").select("id", { count: "exact", head: true }).eq("record_scope", "current").neq("account_status", "unbound"),
    supabase.from("members").select("id", { count: "exact", head: true }).eq("record_scope", "current").neq("account_status", "unbound").eq("status", "pending"),
    supabase.from("members").select("id", { count: "exact", head: true }).eq("record_scope", "current").neq("account_status", "unbound").eq("status", "approved"),
    supabase.from("members").select("id", { count: "exact", head: true }).eq("record_scope", "current").neq("account_status", "unbound").eq("status", "rejected"),
  ])

  return {
    total: totalMembers ?? 0,
    pending: pendingMembers ?? 0,
    approved: approvedMembers ?? 0,
    rejected: rejectedMembers ?? 0,
  }
}
