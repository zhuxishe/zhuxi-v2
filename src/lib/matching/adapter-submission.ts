/**
 * 从 match_round_submissions 构建候选人
 */

import { getImportedLegacyProfile } from "./import-metadata"
import { getSingleRelation } from "@/lib/supabase/relations"

/** DB stores gender as 'male'/'female'/'other'; algorithm expects '男'/'女' */
function normalizeGender(g: string | null): string | null {
  if (g === "male") return "男"
  if (g === "female") return "女"
  return g
}

import type { MatchCandidate } from "./types"

 
type MemberRow = Record<string, any>
 
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
  const importedLegacy = getImportedLegacyProfile(sub.import_metadata)
  const identity = getSingleRelation(memberProfile?.member_identity) ?? {}
  const interests = getSingleRelation(memberProfile?.member_interests) ?? {}
  const personality = getSingleRelation(memberProfile?.member_personality) ?? {}
  const stats = getSingleRelation(memberProfile?.member_dynamic_stats) ?? {}
  const boundaries = getSingleRelation(memberProfile?.member_boundaries) ?? {}
  const language = getSingleRelation(memberProfile?.member_language) ?? {}
  const quiz = getSingleRelation(memberProfile?.personality_quiz_results)

  const gameTypePref = sub.game_type_pref ?? "都可以"
  const genderPref = sub.gender_pref ?? "都可以"
  const availability = (sub.availability ?? {}) as Record<string, string[]>

  const formTags: string[] = sub.interest_tags ?? []
  const profileTags: string[] = [
    ...(identity.hobby_tags ?? []),
    ...(interests.scenario_mode_pref ?? []),
    ...(interests.scenario_theme_tags ?? []),
    ...(importedLegacy?.interest_tags ?? []),
  ]
  const mergedInterests = [...new Set([...formTags, ...profileTags])]

  const mergedSocial: string[] = [
    ...(identity.personality_self_tags ?? []),
    ...(personality.expression_style_tags ?? []),
    ...(personality.group_role_tags ?? []),
    ...(importedLegacy?.social_tags ?? []),
  ]

  const level = stats.activity_count ?? importedLegacy?.session_count ?? 0
  const name = identity.full_name ?? identity.nickname ?? importedLegacy?.full_name ?? "未知"

  return {
    submissionId: sub.member_id,
    name,
    gameTypePref,
    genderPref,
    availability,
    formInterestTags: formTags,
    formSocialStyle: sub.social_style ?? personality.warmup_speed ?? null,
    gender: normalizeGender(identity.gender ?? importedLegacy?.gender ?? null),
    school: identity.school_name ?? importedLegacy?.school ?? null,
    interestTags: mergedInterests,
    socialTags: mergedSocial,
    level,
    compatibilityScore: memberProfile?.attractiveness_score ?? importedLegacy?.compatibility_score ?? null,
    matchHistory,
    gameMode: interests.scenario_mode_pref?.[0] ?? importedLegacy?.game_mode ?? null,
    hasProfile: !!(identity.full_name ?? importedLegacy?.full_name),
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
    quizScores: quiz
      ? { E: quiz.score_e, A: quiz.score_a, O: quiz.score_o, C: quiz.score_c, N: quiz.score_n }
      : null,
  }
}
