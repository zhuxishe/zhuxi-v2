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
  language: boolean
  interests: boolean
  personality: boolean
  boundaries: boolean
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
  const language = !!profile.member_language
  const interests = !!profile.member_interests
  const personality = !!profile.member_personality
  const boundaries = !!profile.member_boundaries

  const filled = [identity, language, interests, personality, boundaries].filter(Boolean).length
  const percentage = Math.round((filled / 5) * 100)

  return { identity, language, interests, personality, boundaries, percentage }
}
