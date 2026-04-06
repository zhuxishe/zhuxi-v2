import { createClient } from "@/lib/supabase/server"

export async function fetchPlayerProfile(memberId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("members")
    .select(`
      id, member_number, status, email,
      member_identity (full_name, nickname),
      member_language (*),
      member_interests (*),
      member_personality (*),
      member_boundaries (*)
    `)
    .eq("id", memberId)
    .single()

  if (error) throw error
  return data
}

export interface ProfileCompleteness {
  identity: boolean
  supplementary: boolean
  personality: boolean
  percentage: number
}

export function calcCompleteness(profile: {
  member_identity: unknown
  member_language: unknown
  member_interests: unknown
  member_personality: unknown
  member_boundaries: unknown
}): ProfileCompleteness {
  const identity = !!profile.member_identity
  const supplementary = !!profile.member_language || !!profile.member_interests
  const personality = !!profile.member_personality

  const filled = [identity, supplementary, personality].filter(Boolean).length
  const percentage = Math.round((filled / 3) * 100)

  return { identity, supplementary, personality, percentage }
}
