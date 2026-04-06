// Supplementary form options (3a) — code constants for Phase 3
// Will migrate to tag_dictionaries table later

export const ACTIVITY_AREA_OPTIONS = [
  "新宿/渋谷", "池袋", "上野/秋葉原", "品川/目黒",
  "六本木/赤坂", "横浜", "千葉", "さいたま", "其他",
] as const

export const NEAREST_STATION_PLACEHOLDER = "例：新宿駅、池袋駅"

export const GRADUATION_YEAR_OPTIONS = [
  2025, 2026, 2027, 2028, 2029, 2030,
] as const

export const COMMUNICATION_LANGUAGE_OPTIONS = [
  "中文", "日语", "英语",
] as const

export const JAPANESE_LEVEL_OPTIONS = [
  "N1", "N2", "N3", "N4", "N5", "无证书但能日常交流", "不会日语",
] as const

export const SCENARIO_MODE_OPTIONS = [
  "推理本", "情感本", "恐怖本", "欢乐本", "机制本", "阵营本", "沉浸本",
] as const

export const SCENARIO_THEME_OPTIONS = [
  "情感", "推理", "机制", "恐怖", "欢乐", "沉浸", "硬核", "新手友好",
] as const

export const GROUP_SIZE_OPTIONS = [
  "4-5人", "6-7人", "8-10人", "10人以上", "都可以",
] as const

export const SCRIPT_PREFERENCE_OPTIONS = [
  "新本", "经典本", "城限本", "独家本", "都可以",
] as const

export const NON_SCRIPT_PREFERENCE_OPTIONS = [
  "桌游", "聚餐", "KTV", "运动", "旅行", "展览", "读书会", "其他",
] as const

export const ACTIVITY_FREQUENCY_OPTIONS = [
  "每周1次以上", "每周1次", "每两周1次", "每月1次", "不固定",
] as const

export const TIME_SLOT_OPTIONS = [
  "工作日白天", "工作日晚上", "周末白天", "周末晚上",
] as const

export const BUDGET_RANGE_OPTIONS = [
  "~2000円", "2000~4000円", "4000~6000円", "6000円以上", "无所谓",
] as const

export const TRAVEL_RADIUS_OPTIONS = [
  "30分钟以内", "1小时以内", "1~2小时", "都可以",
] as const

export const SOCIAL_GOAL_OPTIONS = [
  "认识新朋友", "找固定玩伴", "练习日语",
  "体验文化", "打发时间", "拓展社交圈",
] as const
