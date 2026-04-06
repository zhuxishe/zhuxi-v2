// Tag dictionaries — code constants for Phase 1-3
// Will migrate to database (tag_dictionaries table) in Phase 2

export const HOBBY_TAGS = [
  "剧本杀", "桌游", "咖啡探店", "美食", "旅行",
  "运动", "音乐", "电影", "动漫", "游戏",
  "读书", "摄影", "烹饪", "手工", "绘画",
  "舞蹈", "编程", "语言学习", "宠物", "户外活动",
  "瑜伽/冥想", "购物", "志愿活动", "其他",
] as const

export const ACTIVITY_TYPE_TAGS = [
  "剧本杀", "桌游", "聚餐", "咖啡", "城市散步",
  "看展", "观影", "K歌", "运动", "旅行",
  "TRPG", "密室逃脱", "志愿活动", "其他",
] as const

export const PERSONALITY_SELF_TAGS = [
  "外向", "内向", "社牛", "社恐", "慢热",
  "幽默", "认真", "温和", "直率", "活泼",
] as const

export const TABOO_TAGS = [
  // 行为类
  "迟到爽约", "临时变卦", "强行劝酒", "室内吸烟",
  "过度肢体接触", "过度打探隐私", "偷拍",
  "恋爱导向过强", "借钱/推销", "酒后失控",
  "脏话攻击", "情绪输出过强",
  // 场景类
  "私人空间局", "单独异性局", "临时加人", "过远通勤",
  // 内容类
  "不接受恐怖内容", "不接受高压竞争",
  // 通用
  "无明显禁忌", "其他",
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
