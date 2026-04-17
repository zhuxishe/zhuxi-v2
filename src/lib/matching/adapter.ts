/**
 * V2 数据库 → MatchCandidate 适配器
 * 将 V2 多表结构转换为匹配算法所需的 MatchCandidate 格式
 */

import type { MatchCandidate, Availability } from "./types"

// Re-export for backward compatibility
export { submissionToCandidate } from "./adapter-submission"

 
type MemberRow = Record<string, any>
 
type AnyRecord = Record<string, any>

/** Supabase join 可能返回数组或对象，统一解包 */
function unwrap(val: unknown): AnyRecord {
  if (Array.isArray(val)) return (val[0] as AnyRecord) ?? {}
  return (val as AnyRecord) ?? {}
}

/**
 * member_interests.game_type_pref → 算法枚举
 * DB: "双人本优先"|"多人本优先"|"都可以"|"看活动而定"|null
 * Algorithm: "双人"|"多人"|"都可以"
 */
function normalizeGameTypePref(pref: string | null | undefined): "双人" | "多人" | "都可以" {
  if (!pref) return "都可以"
  if (pref.startsWith("双人")) return "双人"
  if (pref.startsWith("多人")) return "多人"
  return "都可以"
}

/**
 * member_boundaries.preferred_gender_mix → 算法枚举
 * DB 是自由文本，保守处理：仅识别明确值
 */
function normalizeGenderPref(pref: string | null | undefined): "男" | "女" | "都可以" {
  if (!pref) return "都可以"
  if (pref === "男" || pref === "男性のみ" || pref === "only_male") return "男"
  if (pref === "女" || pref === "女性のみ" || pref === "only_female") return "女"
  return "都可以"
}

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
  const identity = unwrap(member.member_identity)
  const interests = unwrap(member.member_interests)
  const personality = unwrap(member.member_personality)
  const language = unwrap(member.member_language)
  const boundaries = unwrap(member.member_boundaries)
  const stats = unwrap(member.member_dynamic_stats)

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
    gameTypePref: normalizeGameTypePref(interests.game_type_pref as string | null),
    genderPref: normalizeGenderPref(boundaries.preferred_gender_mix as string | null),
    availability,
    formInterestTags: interests.scenario_mode_pref ?? [],
    formSocialStyle: personality.warmup_speed ?? null,
    gender: (() => { const g = identity.gender ?? null; return g === "male" ? "男" : g === "female" ? "女" : g })(),
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
