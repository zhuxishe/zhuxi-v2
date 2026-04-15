export interface ProfileData {
  id: string
  member_number: string | null
  status: string
  email: string | null
  member_identity: {
    full_name: string | null
    nickname: string | null
    gender: string | null
    age_range: string | null
    school_name: string | null
    department: string | null
    degree_level: string | null
    course_language: string | null
    enrollment_year: number | null
    hobby_tags: string[] | null
    activity_type_tags: string[] | null
    personality_self_tags: string[] | null
    taboo_tags: string[] | null
  }[] | null
  member_language: {
    japanese_level: string | null
    communication_language_pref: string[] | null
  }[] | null
  member_interests: {
    activity_area: string | null
    activity_frequency: string | null
    game_type_pref: string | null
    scenario_mode_pref: string[] | null
    budget_range: string | null
    preferred_time_slots: string[] | null
    ideal_group_size: string | null
    travel_radius: string | null
    script_preference: string[] | null
    non_script_preference: string[] | null
  }[] | null
  member_personality: {
    expression_style_tags: string[] | null
    group_role_tags: string[] | null
    warmup_speed: string | null
    planning_style: string | null
    coop_compete_tendency: string | null
    extroversion: number | null
    initiative: number | null
    emotional_stability: number | null
    boundary_strength: string | null
    reply_speed: string | null
  }[] | null
  personality_quiz_results: {
    score_e: number | null
    score_a: number | null
    score_o: number | null
    score_c: number | null
    score_n: number | null
    personality_type: string | null
  }[] | null
  member_dynamic_stats: {
    activity_count: number | null
    review_count: number | null
    avg_review_score: number | null
  }[] | null
}

export const GENDER_MAP: Record<string, string> = {
  male: '男', female: '女', other: '其他',
}

export const DEGREE_MAP: Record<string, string> = {
  undergraduate: '本科', master: '硕士', doctoral: '博士',
  exchange: '交换生', language_school: '语言学校', other: '其他',
}

export const STATUS_MAP: Record<string, string> = {
  pending: '待审核', approved: '已批准', rejected: '已拒绝', inactive: '已停用',
}

export function unwrap<T>(data: T[] | T | null | undefined): T | null {
  if (!data) return null
  if (Array.isArray(data)) return data[0] || null
  return data
}
