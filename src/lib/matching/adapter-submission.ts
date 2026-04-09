/**
 * 从 match_round_submissions 构建候选人
 */

/** DB stores gender as 'male'/'female'/'other'; algorithm expects '男'/'女' */
function normalizeGender(g: string | null): string | null {
  if (g === "male") return "男"
  if (g === "female") return "女"
  return g
}

import type { MatchCandidate } from "./types"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MemberRow = Record<string, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SubmissionRow = Record<string, any>

/**
 * 从调查问卷 + 用户档案构建 MatchCandidate
 * 本轮偏好（游戏类型/性别/可用时段）从 submission 读取
 * 个人特征（性别/学校/兴趣/人格）从 member profile 读取
 */
export function submissionToCandidate(
  sub: SubmissionRow,
  memberProfile: MemberRow | null,
  matchHistory: { name: string; count: number }[],
): MatchCandidate {
  const identity = memberProfile?.member_identity ?? {}
  const interests = memberProfile?.member_interests ?? {}
  const personality = memberProfile?.member_personality ?? {}
  const stats = memberProfile?.member_dynamic_stats ?? {}

  const gameTypePref = sub.game_type_pref ?? "都可以"
  const genderPref = sub.gender_pref ?? "都可以"
  const availability = (sub.availability ?? {}) as Record<string, string[]>

  const formTags: string[] = sub.interest_tags ?? []
  const profileTags: string[] = [
    ...(identity.hobby_tags ?? []),
    ...(interests.scenario_mode_pref ?? []),
    ...(interests.scenario_theme_tags ?? []),
  ]
  const mergedInterests = [...new Set([...formTags, ...profileTags])]

  const mergedSocial: string[] = [
    ...(identity.personality_self_tags ?? []),
    ...(personality.expression_style_tags ?? []),
    ...(personality.group_role_tags ?? []),
  ]

  const level = stats.activity_count ?? 0
  const name = identity.full_name ?? identity.nickname ?? "未知"

  return {
    submissionId: sub.id,
    name,
    gameTypePref,
    genderPref,
    availability,
    formInterestTags: formTags,
    formSocialStyle: sub.social_style ?? personality.warmup_speed ?? null,
    gender: normalizeGender(identity.gender ?? null),
    school: identity.school_name ?? null,
    interestTags: mergedInterests,
    socialTags: mergedSocial,
    level,
    compatibilityScore: memberProfile?.attractiveness_score ?? null,
    matchHistory,
    gameMode: interests.scenario_mode_pref?.[0] ?? null,
    hasProfile: !!identity.full_name,
    tabooTags: [
      ...(identity.taboo_tags ?? []),
      ...(memberProfile?.member_boundaries?.taboo_tags ?? []),
      ...(memberProfile?.member_boundaries?.deal_breakers ?? []),
    ],
    languagePref: memberProfile?.member_language?.communication_language_pref ?? [],
    japaneseLevel: memberProfile?.member_language?.japanese_level ?? null,
    acceptBeginners: interests.accept_beginners ?? true,
    acceptCrossSchool: interests.accept_cross_school ?? true,
    activityArea: interests.activity_area ?? identity.current_city ?? null,
    reliabilityScore: stats.reliability_score ?? 5.0,
    quizScores: (() => {
      const q = Array.isArray(memberProfile?.personality_quiz_results)
        ? memberProfile.personality_quiz_results[0]
        : memberProfile?.personality_quiz_results
      if (!q) return null
      return { E: q.score_e, A: q.score_a, O: q.score_o, C: q.score_c, N: q.score_n }
    })(),
  }
}
