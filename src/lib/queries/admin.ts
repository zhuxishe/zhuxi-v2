import { createClient } from "@/lib/supabase/server"

export async function fetchDashboardStats() {
  const supabase = await createClient()

  const [
    { count: totalMembers },
    { count: pendingMembers },
    { count: approvedMembers },
    { count: rejectedMembers },
  ] = await Promise.all([
    supabase.from("members").select("*", { count: "exact", head: true }),
    supabase.from("members").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("members").select("*", { count: "exact", head: true }).eq("status", "approved"),
    supabase.from("members").select("*", { count: "exact", head: true }).eq("status", "rejected"),
  ])

  return {
    total: totalMembers ?? 0,
    pending: pendingMembers ?? 0,
    approved: approvedMembers ?? 0,
    rejected: rejectedMembers ?? 0,
  }
}
