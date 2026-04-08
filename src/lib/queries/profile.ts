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
      member_boundaries (*),
      personality_quiz_results (score_e, score_a, score_o, score_c, score_n)
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
  quiz: boolean
  percentage: number
}

export function calcCompleteness(profile: {
  member_identity: unknown
  member_language: { communication_language_pref?: string[] | null } | { communication_language_pref?: string[] | null }[] | null
  member_interests: { activity_frequency?: string | null } | { activity_frequency?: string | null }[] | null
  member_personality: { expression_style_tags?: string[] | null } | { expression_style_tags?: string[] | null }[] | null
  member_boundaries: unknown
  personality_quiz_results: { score_e?: number | null } | { score_e?: number | null }[] | null
}): ProfileCompleteness {
  const identity = !!profile.member_identity

  // Unwrap: Supabase may return array or object for 1:1 joins
  const lang = Array.isArray(profile.member_language) ? profile.member_language[0] : profile.member_language
  const interests = Array.isArray(profile.member_interests) ? profile.member_interests[0] : profile.member_interests
  const personality = Array.isArray(profile.member_personality) ? profile.member_personality[0] : profile.member_personality
  const quizResult = Array.isArray(profile.personality_quiz_results)
    ? profile.personality_quiz_results[0]
    : profile.personality_quiz_results

  // Supplementary = language AND interests both have meaningful data
  const hasLanguage = !!lang &&
    Array.isArray(lang.communication_language_pref) &&
    lang.communication_language_pref.length > 0
  const hasInterests = !!interests && !!interests.activity_frequency
  const supplementary = hasLanguage && hasInterests

  const hasPersonality = !!personality &&
    Array.isArray(personality.expression_style_tags) &&
    personality.expression_style_tags.length > 0

  // 性格测试：有任意分数则视为已完成
  const quiz = !!quizResult && quizResult.score_e != null

  const filled = [identity, supplementary, hasPersonality, quiz].filter(Boolean).length
  const percentage = Math.round((filled / 4) * 100)

  return { identity, supplementary, personality: hasPersonality, quiz, percentage }
}
