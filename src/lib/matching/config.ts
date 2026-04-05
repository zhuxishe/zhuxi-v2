import type { MatchingConfig } from "./types"

export const DEFAULT_CONFIG: MatchingConfig = {
  weights: {
    interest_overlap: 20,
    social_complement: 15,
    school_diversity: 15,
    compatibility_score: 15,
    repeat_penalty: 15,
    gameMode_match: 10,
    level_proximity: 10,
  },
  complementPairs: [
    ["慢热", "活跃"],
    ["善于倾听", "话题广"],
    ["温和", "喜欢竞技"],
    ["初心者", "喜欢带节奏"],
  ],
  hardConstraints: {
    enforceGender: true,
  },
  preferCrossSchool: true,
  repeatDecayFactor: 0.3,
  defaultCompatibilityScore: 3.93, // 数据库中位数
}
