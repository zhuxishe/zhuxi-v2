/**
 * V2 数据库 → MatchCandidate 适配器
 * 将 V2 多表结构转换为匹配算法所需的 MatchCandidate 格式
 */

import type { MatchCandidate, Availability } from "./types"

// Re-export for backward compatibility
export { submissionToCandidate } from "./adapter-submission"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MemberRow = Record<string, any>

/** 将用户存储的时段偏好映射为 14 天可用时间表 */
function buildAvailability(timeSlots: string[] | null): Availability {
  const avail: Availability = {}
  const today = new Date()
  const slots = timeSlots?.length ? timeSlots : ["上午", "下午", "晚上"]

  for (let i = 0; i < 14; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    const key = d.toISOString().split("T")[0]
    avail[key] = [...slots]
  }
  return avail
}

/**
 * 将 V2 成员数据转换为 MatchCandidate
 * member 应包含 join 的所有子表
 */
export function toMatchCandidate(
  member: MemberRow,
  matchHistory?: { name: string; count: number }[],
): MatchCandidate {
  const identity = member.member_identity ?? {}
  const interests = member.member_interests ?? {}
  const personality = member.member_personality ?? {}
  const language = member.member_language ?? {}
  const boundaries = member.member_boundaries ?? {}
  const stats = member.member_dynamic_stats ?? {}

  const mergedInterests = [
    ...(identity.hobby_tags ?? []),
    ...(identity.activity_type_tags ?? []),
    ...(interests.scenario_mode_pref ?? []),
    ...(interests.non_script_preference ?? []),
    ...(interests.scenario_theme_tags ?? []),
  ]

  const mergedSocial = [
    ...(identity.personality_self_tags ?? []),
    ...(personality.expression_style_tags ?? []),
    ...(personality.group_role_tags ?? []),
  ]

  const level = stats.activity_count ?? 0
  const availability = buildAvailability(interests.preferred_time_slots)

  return {
    submissionId: member.id,
    name: identity.full_name ?? identity.nickname ?? "未知",
    gameTypePref: "都可以",
    genderPref: "都可以",
    availability,
    formInterestTags: interests.scenario_mode_pref ?? [],
    formSocialStyle: personality.warmup_speed ?? null,
    gender: identity.gender ?? null,
    school: identity.school_name ?? null,
    interestTags: mergedInterests,
    socialTags: mergedSocial,
    level,
    compatibilityScore: member.attractiveness_score ?? null,
    matchHistory: matchHistory ?? [],
    gameMode: interests.scenario_mode_pref?.[0] ?? null,
    hasProfile: !!identity.full_name,
    tabooTags: [
      ...(identity.taboo_tags ?? []),
      ...(boundaries.taboo_tags ?? []),
      ...(boundaries.deal_breakers ?? []),
    ],
    languagePref: language.communication_language_pref ?? [],
    japaneseLevel: language.japanese_level ?? null,
    acceptBeginners: interests.accept_beginners ?? true,
    acceptCrossSchool: interests.accept_cross_school ?? true,
    activityArea: interests.activity_area ?? identity.current_city ?? null,
    reliabilityScore: stats.reliability_score ?? 5.0,
    quizScores: (() => {
      const q = Array.isArray(member.personality_quiz_results)
        ? member.personality_quiz_results[0]
        : member.personality_quiz_results
      if (!q) return null
      return { E: q.score_e, A: q.score_a, O: q.score_o, C: q.score_c, N: q.score_n }
    })(),
  }
}

/** 批量转换 (with match history) */
export function toMatchCandidates(
  members: MemberRow[],
  historyMap?: Map<string, { name: string; count: number }[]>,
): MatchCandidate[] {
  return members.map((m) =>
    toMatchCandidate(m, historyMap?.get(m.id) ?? []),
  )
}
