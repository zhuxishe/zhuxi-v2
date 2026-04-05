/**
 * V2 数据库 → MatchCandidate 适配器
 * 将 V2 多表结构转换为匹配算法所需的 MatchCandidate 格式
 */

import type { MatchCandidate, Availability } from "./types"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MemberRow = Record<string, any>

/** 生成未来 14 天全可用的默认时间表（MVP 阶段跳过时段筛选） */
function defaultAvailability(): Availability {
  const avail: Availability = {}
  const today = new Date()
  for (let i = 0; i < 14; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    const key = d.toISOString().split("T")[0]
    avail[key] = ["上午", "下午", "晚上"]
  }
  return avail
}

/**
 * 将 V2 成员数据转换为 MatchCandidate
 * member 应包含 join 的 member_identity, member_interests, member_personality
 */
export function toMatchCandidate(member: MemberRow): MatchCandidate {
  const identity = member.member_identity ?? {}
  const interests = member.member_interests ?? {}
  const personality = member.member_personality ?? {}

  // 合并兴趣标签：identity 里的 + interests 里的
  const mergedInterests = [
    ...(identity.hobby_tags ?? []),
    ...(identity.activity_type_tags ?? []),
    ...(interests.scenario_mode_pref ?? []),
    ...(interests.non_script_preference ?? []),
  ]

  // 合并社交标签：identity 的性格自评 + personality 的表达/角色
  const mergedSocial = [
    ...(identity.personality_self_tags ?? []),
    ...(personality.expression_style_tags ?? []),
    ...(personality.group_role_tags ?? []),
  ]

  // 活动次数作为等级 (0=新手)
  const level = member.activity_count ?? 0

  return {
    submissionId: member.id,
    name: identity.full_name ?? identity.nickname ?? "未知",
    gameTypePref: "都可以",
    genderPref: "都可以",
    availability: defaultAvailability(),
    formInterestTags: interests.scenario_mode_pref ?? [],
    formSocialStyle: personality.warmup_speed ?? null,
    gender: identity.gender ?? null,
    school: identity.school_name ?? null,
    interestTags: mergedInterests,
    socialTags: mergedSocial,
    level,
    compatibilityScore: member.attractiveness_score ?? null,
    matchHistory: [],
    gameMode: interests.scenario_mode_pref?.[0] ?? null,
    hasProfile: !!identity.full_name,
  }
}

/** 批量转换 */
export function toMatchCandidates(members: MemberRow[]): MatchCandidate[] {
  return members.map(toMatchCandidate)
}
