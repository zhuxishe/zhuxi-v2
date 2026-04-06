import { createClient } from "@/lib/supabase/server"
import type { MemberWithIdentity } from "@/types"

export async function fetchMembers(options?: {
  status?: string
  search?: string
}): Promise<MemberWithIdentity[]> {
  const supabase = await createClient()

  let query = supabase
    .from("members")
    .select(`
      id, member_number, status, interview_date, interviewer,
      attractiveness_score, created_at,
      member_identity (
        full_name, nickname, gender, age_range,
        nationality, current_city, school_name, department
      )
    `)
    .order("created_at", { ascending: false })

  if (options?.status && options.status !== "all") {
    query = query.eq("status", options.status)
  }

  const { data, error } = await query

  if (error) throw error

  let members = (data ?? []) as unknown as MemberWithIdentity[]

  // Client-side search filter (name/nickname/school)
  if (options?.search) {
    const q = options.search.toLowerCase()
    members = members.filter((m) => {
      const identity = m.member_identity
      if (!identity) return false
      return (
        identity.full_name.toLowerCase().includes(q) ||
        identity.nickname?.toLowerCase().includes(q) ||
        identity.school_name?.toLowerCase().includes(q) ||
        m.member_number?.toLowerCase().includes(q)
      )
    })
  }

  return members
}

export async function fetchMemberDetail(id: string) {
  const supabase = await createClient()

  const { data: member, error } = await supabase
    .from("members")
    .select(`
      *,
      member_identity (*),
      interview_evaluations (*),
      member_language (*),
      member_interests (*),
      member_personality (*),
      member_boundaries (*),
      member_verification (*)
    `)
    .eq("id", id)
    .single()

  if (error) throw error
  return member
}
