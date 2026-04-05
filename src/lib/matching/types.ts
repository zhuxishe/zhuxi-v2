/**
 * 竹溪社首轮匹配 — 类型定义
 */

// ── 时间段 ──

export type TimeSlot = "上午" | "下午" | "晚上"
export type TimeSlotOrFull = TimeSlot | "全天"

/** 14天可用时间 {"2026-04-06": ["上午","下午"], ...} */
export type Availability = Record<string, string[]>

// ── 表单提交 ──

export interface Submission {
  id: string
  name: string
  game_type_pref: "双人" | "多人" | "都可以"
  gender_pref: "男" | "女" | "都可以"
  availability: Availability
  interest_tags: string[]
  social_style: string | null
  message: string | null
  matched_profile_id: string | null
  member_data: MemberProfile | null
  is_matched: boolean
  created_at: string
  updated_at: string
}

// ── 数据库玩家档案 (members_clean.json) ──

export interface MemberProfile {
  no: string
  name: string
  nickname?: string
  gender?: string
  age?: number
  nationality?: string
  school?: string
  department?: string
  courseLanguage?: string
  interestTags: string[]
  socialTags: string[]
  gameMode?: string // "双人本" | "多人本" | "都行"
  gamePreferences: string[]
  socialGoals: string[]
  personalTaboos?: string
  compatibilityScore?: number // 合拍分 3.0-5.0
  sessionCount?: number
  matchHistory: { name: string; count: number }[]
  offlineActivityCount?: number
}

// ── 匹配候选人 (合并表单+档案) ──

export interface MatchCandidate {
  submissionId: string
  name: string
  // 表单字段
  gameTypePref: "双人" | "多人" | "都可以"
  genderPref: "男" | "女" | "都可以"
  availability: Availability
  formInterestTags: string[]
  formSocialStyle: string | null
  // 档案字段 (可空 = 新玩家)
  gender: string | null
  school: string | null
  interestTags: string[] // 合并后的兴趣标签
  socialTags: string[]
  level: number // 0=新手
  compatibilityScore: number | null
  matchHistory: { name: string; count: number }[]
  gameMode: string | null
  hasProfile: boolean
}

// ── 评分 ──

export interface ScoreComponent {
  factor: string
  label: string
  weight: number
  rawScore: number
  weightedScore: number
  detail: string
}

export interface PairScore {
  userA: string
  userB: string
  totalScore: number
  breakdown: ScoreComponent[]
  hardVeto: boolean
  vetoReasons: string[]
  explanationZh: string
}

export interface AssignedPair {
  userA: string
  userB: string
  score: PairScore
  rank: number
}

export interface MatchAssignment {
  pairs: AssignedPair[]
  unmatched: string[]
  totalScore: number
  metadata: {
    candidateCount: number
    pairCount: number
    averageScore: number
    minScore: number
    maxScore: number
    algorithmUsed: "optimized" | "greedy"
  }
}

// ── 匹配配置 ──

export interface MatchingConfig {
  weights: {
    interest_overlap: number
    social_complement: number
    school_diversity: number
    compatibility_score: number
    repeat_penalty: number
    gameMode_match: number
    level_proximity: number
  }
  complementPairs: [string, string][]
  hardConstraints: {
    enforceGender: boolean
  }
  preferCrossSchool: boolean
  repeatDecayFactor: number
  defaultCompatibilityScore: number // 无合拍分时的默认值
}

// ── 匹配结果 (DB) ──

export interface MatchResult {
  id: string
  run_id: string
  time_slot: string
  game_type: string
  member_ids: string[]
  score: number | null
  score_breakdown: unknown
  status: "draft" | "confirmed"
  created_at: string
}
