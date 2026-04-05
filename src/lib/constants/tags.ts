// Tag dictionaries — code constants for Phase 1-3
// Will migrate to database (tag_dictionaries table) in Phase 2

export const HOBBY_TAGS = [
  "游戏", "动漫", "音乐", "电影", "读书",
  "运动", "旅行", "摄影", "烹饪", "手工",
  "绘画", "舞蹈", "编程", "语言学习", "桌游",
] as const

export const ACTIVITY_TYPE_TAGS = [
  "剧本杀", "桌游", "运动", "聚餐", "旅行",
  "观影", "K歌", "展览", "学习", "其他",
] as const

export const PERSONALITY_SELF_TAGS = [
  "外向", "内向", "社牛", "社恐", "慢热",
  "幽默", "认真", "温和", "直率", "活泼",
] as const

export const TABOO_TAGS = [
  "恐怖题材", "政治话题", "过度饮酒", "深夜活动",
  "高强度运动", "密闭空间", "其他",
] as const

export const AGE_RANGE_OPTIONS = [
  "18-20", "21-23", "24-26", "27-29", "30+",
] as const

export const NATIONALITY_OPTIONS = [
  "中国大陆", "中国台湾", "中国香港", "中国澳门",
  "日本", "韩国", "其他亚洲", "其他",
] as const

export const CITY_OPTIONS = [
  "东京都", "神奈川县", "千叶县", "埼玉县", "其他",
] as const

export const COURSE_LANGUAGE_OPTIONS = [
  "日语", "英语", "中文", "混合",
] as const
