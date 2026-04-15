export interface MiniProfileCompleteness {
  identity: boolean
  supplementary: boolean
  personality: boolean
  quiz: boolean
  percentage: number
}

interface MiniProfileInput {
  member_identity: unknown
  member_language:
    | { communication_language_pref?: string[] | null }
    | { communication_language_pref?: string[] | null }[]
    | null
  member_interests:
    | { activity_frequency?: string | null }
    | { activity_frequency?: string | null }[]
    | null
  member_personality:
    | {
        expression_style_tags?: string[] | null
        extroversion?: number | null
        initiative?: number | null
        emotional_stability?: number | null
        warmup_speed?: string | null
      }
    | {
        expression_style_tags?: string[] | null
        extroversion?: number | null
        initiative?: number | null
        emotional_stability?: number | null
        warmup_speed?: string | null
      }[]
    | null
  personality_quiz_results:
    | { score_e?: number | null }
    | { score_e?: number | null }[]
    | null
}

export function calcMiniProfileCompleteness(
  profile: MiniProfileInput
): MiniProfileCompleteness {
  const identityRaw = Array.isArray(profile.member_identity)
    ? profile.member_identity[0]
    : profile.member_identity
  const identity = !!identityRaw

  const language = Array.isArray(profile.member_language)
    ? profile.member_language[0]
    : profile.member_language
  const interests = Array.isArray(profile.member_interests)
    ? profile.member_interests[0]
    : profile.member_interests
  const personality = Array.isArray(profile.member_personality)
    ? profile.member_personality[0]
    : profile.member_personality
  const quiz = Array.isArray(profile.personality_quiz_results)
    ? profile.personality_quiz_results[0]
    : profile.personality_quiz_results

  const hasLanguage =
    !!language &&
    Array.isArray(language.communication_language_pref) &&
    language.communication_language_pref.length > 0
  const hasInterests = !!interests?.activity_frequency
  const supplementary = hasLanguage && hasInterests

  const hasPersonality =
    !!personality &&
    personality.extroversion != null &&
    personality.initiative != null &&
    personality.emotional_stability != null &&
    personality.warmup_speed != null &&
    Array.isArray(personality.expression_style_tags) &&
    personality.expression_style_tags.length > 0

  const hasQuiz = !!quiz && quiz.score_e != null
  const filled = [identity, supplementary, hasPersonality, hasQuiz].filter(Boolean).length

  return {
    identity,
    supplementary,
    personality: hasPersonality,
    quiz: hasQuiz,
    percentage: Math.round((filled / 4) * 100),
  }
}
