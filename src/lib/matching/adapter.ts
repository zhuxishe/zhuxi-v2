/**
 * V2 数据库 → MatchCandidate 适配器
 * 将 V2 多表结构转换为匹配算法所需的 MatchCandidate 格式
 */

import type { MatchCandidate, Availability } from "./types"

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

  // 合并兴趣标签
  const mergedInterests = [
    ...(identity.hobby_tags ?? []),
    ...(identity.activity_type_tags ?? []),
    ...(interests.scenario_mode_pref ?? []),
    ...(interests.non_script_preference ?? []),
    ...(interests.scenario_theme_tags ?? []),
  ]

  // 合并社交标签
  const mergedSocial = [
    ...(identity.personality_self_tags ?? []),
    ...(personality.expression_style_tags ?? []),
    ...(personality.group_role_tags ?? []),
  ]

  // 活动次数作为等级
  const level = stats.activity_count ?? 0

  // 用实际时段偏好而非默认全可用
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
    // Extended fields for hard constraints
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
      // Supabase may return array or object for 1:1 join
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

// ── 从 match_round_submissions 构建候选人 ──

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

  // 问卷字段（本轮）
  const gameTypePref = sub.game_type_pref ?? "都可以"
  const genderPref = sub.gender_pref ?? "都可以"
  const availability = (sub.availability ?? {}) as Record<string, string[]>

  // 合并兴趣标签：问卷 + 档案
  const formTags: string[] = sub.interest_tags ?? []
  const profileTags: string[] = [
    ...(identity.hobby_tags ?? []),
    ...(interests.scenario_mode_pref ?? []),
    ...(interests.scenario_theme_tags ?? []),
  ]
  const mergedInterests = [...new Set([...formTags, ...profileTags])]

  // 社交标签
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
    gender: identity.gender ?? null,
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
