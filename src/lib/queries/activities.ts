import { createClient } from "@/lib/supabase/server"

export async function fetchActivityRecords() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("activity_records")
    .select("*")
    .order("activity_date", { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function fetchMemberStats(memberId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("member_dynamic_stats")
    .select("*")
    .eq("member_id", memberId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function fetchMemberVerification(memberId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("member_verification")
    .select("*")
    .eq("member_id", memberId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function fetchMemberNotes(memberId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("member_notes")
    .select("*")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function fetchPlayerActivities(memberId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("activity_records")
    .select("*")
    .contains("participant_ids", [memberId])
    .order("activity_date", { ascending: false })
  if (error) throw error
  return data ?? []
}
