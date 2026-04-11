/** 人格问卷可配置项的完整类型定义 */

export type Dimension = "E" | "A" | "O" | "C" | "N"

export interface QuizOptionConfig {
  text: string
  score: number // 1.5 / 3 / 4.5 / 6
}

export interface QuizQuestionConfig {
  id: number
  dimension: Dimension
  text: string
  options: QuizOptionConfig[]
}

export interface DimensionConfig {
  name: string           // 显示名，如 "社交能量"
  matchWeight: number    // 匹配权重 0-1，如 0.3
  descriptions: {
    low: string          // 0-33 分解读
    mid: string          // 34-66 分解读
    high: string         // 67-100 分解读
  }
}

export interface TypeLabelsConfig {
  formal: { prefix: Record<string, string>; suffix: Record<string, string> }
  fun: { prefix: Record<string, string>; suffix: Record<string, string> }
}

export interface ScoringConfig {
  minRaw: number      // 最低原始分，默认 4.5
  maxRaw: number      // 最高原始分，默认 18
  invertN: boolean    // N→ES 反转，默认 true
}

export interface TypeDescription {
  description: string     // 幽默解读（~100-200字）
  imageUrl?: string       // 人格配图 URL（可选，后台可上传）
}

export interface QuizConfig {
  questions: QuizQuestionConfig[]
  dimensions: Record<Dimension, DimensionConfig>
  typeLabels: TypeLabelsConfig
  typeDescriptions: Record<string, TypeDescription>  // key = "热情守护者" 等
  scoring: ScoringConfig
}
