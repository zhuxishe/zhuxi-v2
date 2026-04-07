// ── Supplementary form (3a) ──────────────────────

export interface SupplementaryFormData {
  // Step 1: Location
  activity_area: string
  nearest_station: string
  graduation_year: number | null
  // Step 2: Language
  communication_language_pref: string[]
  japanese_level: string
  // Step 3: Activity preferences
  game_type_pref: string
  scenario_mode_pref: string[]
  scenario_theme_tags: string[]
  ideal_group_size: string
  script_preference: string[]
  non_script_preference: string[]
  activity_frequency: string
  preferred_time_slots: string[]
  budget_range: string
  travel_radius: string
  // Step 4: Social goals
  social_goal_primary: string
  social_goal_secondary: string
  accept_beginners: boolean
  accept_cross_school: boolean
}

export const EMPTY_SUPPLEMENTARY: SupplementaryFormData = {
  activity_area: "",
  nearest_station: "",
  graduation_year: null,
  communication_language_pref: [],
  japanese_level: "",
  game_type_pref: "",
  scenario_mode_pref: [],
  scenario_theme_tags: [],
  ideal_group_size: "",
  script_preference: [],
  non_script_preference: [],
  activity_frequency: "",
  preferred_time_slots: [],
  budget_range: "",
  travel_radius: "",
  social_goal_primary: "",
  social_goal_secondary: "",
  accept_beginners: true,
  accept_cross_school: true,
}

// ── Personality self-assessment (3b) ─────────────

export interface PersonalitySelfData {
  extroversion: number
  initiative: number
  expression_style_tags: string[]
  group_role_tags: string[]
  warmup_speed: string
  planning_style: string
  coop_compete_tendency: string
  emotional_stability: number
  boundary_strength: string
  reply_speed: string
}

export const EMPTY_PERSONALITY: PersonalitySelfData = {
  extroversion: 3,
  initiative: 3,
  expression_style_tags: [],
  group_role_tags: [],
  warmup_speed: "",
  planning_style: "",
  coop_compete_tendency: "",
  emotional_stability: 3,
  boundary_strength: "",
  reply_speed: "",
}

// ── Tag option types ─────────────────────────────

export interface TagOption {
  value: string
  label_zh: string
  label_ja: string
}

export interface TagCategory {
  key: string
  label_zh: string
  label_ja: string
  options: TagOption[]
  multiple: boolean
  max?: number
}
