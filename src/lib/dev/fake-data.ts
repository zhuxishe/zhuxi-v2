// Constant pools for random test data generation
// Reference: src/lib/constants/tags.ts + supplementary.ts + personality.ts

export const FAKE_NAMES = [
  "张伟", "李娜", "王芳", "刘洋", "陈静", "赵磊", "周敏", "吴强",
  "孙丽", "朱鹏", "马超", "黄浩", "杨柳", "林瑶", "郑凯", "谢婷",
  "韩雪", "唐亮", "曹悦", "许翔",
] as const

export const FAKE_SCHOOLS = [
  "东京大学", "早稻田大学", "庆应义塾大学", "明治大学", "上智大学",
  "东京工业大学", "一桥大学", "法政大学", "立教大学", "青山学院大学",
] as const

export const FAKE_DEPARTMENTS = [
  "经济学", "社会学", "计算机科学", "机械工程", "国际关系",
  "心理学", "法学", "文学", "设计", "生物学",
] as const

export const GENDER_OPTIONS = ["male", "female", "other"] as const

export const AGE_RANGE_OPTIONS = [
  "18-20", "21-23", "24-26", "27-29", "30+",
] as const

export const NATIONALITY_OPTIONS = [
  "中国大陆", "中国台湾", "日本", "韩国",
] as const

export const CITY_OPTIONS = [
  "东京都", "神奈川县", "千叶县", "埼玉县",
] as const

export const HOBBY_TAGS = [
  "剧本杀", "桌游", "咖啡探店", "美食", "旅行",
  "运动", "音乐", "电影", "动漫", "游戏",
  "读书", "摄影", "烹饪",
] as const

export const ACTIVITY_TYPE_TAGS = [
  "剧本杀", "桌游", "聚餐", "咖啡", "城市散步",
  "看展", "观影", "K歌", "运动",
] as const

export const PERSONALITY_SELF_TAGS = [
  "外向", "内向", "社牛", "慢热", "幽默", "温和", "直率",
] as const

export const TABOO_TAGS = [
  "迟到爽约", "临时变卦", "过度打探隐私",
  "恋爱导向过强", "不接受恐怖内容", "无明显禁忌",
] as const

export const EXPRESSION_STYLE_TAGS = [
  "温和", "直率", "幽默", "理性", "倾听型",
] as const

export const GROUP_ROLE_TAGS = [
  "组织者", "破冰者", "倾听者", "气氛组",
] as const

export const WARMUP_SPEED_OPTIONS = [
  "快速熟络", "先浅后深", "慢热稳定",
] as const

export const SCENARIO_MODE_OPTIONS = [
  "推理本", "情感本", "恐怖本", "欢乐本", "机制本",
] as const

export const GAME_TYPE_PREF_OPTIONS = ["双人", "多人", "都可以"] as const
export const GENDER_PREF_OPTIONS = ["男", "女", "都可以"] as const

export const INTEREST_TAGS = [
  "剧本杀", "桌游", "聚餐", "K歌", "运动", "旅行",
] as const

export const ACTIVITY_AREA_OPTIONS = [
  "新宿/渋谷", "池袋", "上野/秋葉原", "品川/目黒", "横浜",
] as const

export const TIME_SLOT_OPTIONS = [
  "周六白天", "周六晚", "周日白天", "周日晚",
  "工作日晚间", "周五晚",
] as const

// ── Helpers ──

/** Pick a random element from an array */
export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** Pick N random unique elements from an array */
export function pickN<T>(arr: readonly T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(n, arr.length))
}

/** Random integer between min and max (inclusive) */
export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
