import { createClient } from "@/lib/supabase/server"
import type { QuizConfig } from "@/types/quiz-config"
import type { Json } from "@/types/database.types"
import { buildDefaultQuizConfig } from "@/lib/constants/personality-quiz"

/** 读取问卷配置，DB 无数据时返回硬编码默认值 */
export async function getQuizConfig(): Promise<QuizConfig> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("personality_quiz_config")
    .select("questions, dimensions, type_labels, type_descriptions, scoring")
    .limit(1)
    .single()

  if (!data) return buildDefaultQuizConfig()

  return {
    questions: data.questions as unknown as QuizConfig["questions"],
    dimensions: data.dimensions as unknown as QuizConfig["dimensions"],
    typeLabels: data.type_labels as unknown as QuizConfig["typeLabels"],
    typeDescriptions: (data.type_descriptions ?? {}) as unknown as QuizConfig["typeDescriptions"],
    scoring: data.scoring as unknown as QuizConfig["scoring"],
  }
}

/** 保存问卷配置（upsert 单行） */
export async function saveQuizConfig(
  config: QuizConfig,
  updatedBy: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()

  // 先查是否有记录
  const { data: existing } = await supabase
    .from("personality_quiz_config")
    .select("id")
    .limit(1)
    .single()

  const payload = {
    questions: config.questions as unknown as Json,
    dimensions: config.dimensions as unknown as Json,
    type_labels: config.typeLabels as unknown as Json,
    type_descriptions: config.typeDescriptions as unknown as Json,
    scoring: config.scoring as unknown as Json,
    updated_by: updatedBy,
  }

  const { error } = existing
    ? await supabase.from("personality_quiz_config").update(payload).eq("id", existing.id)
    : await supabase.from("personality_quiz_config").insert(payload)

  return error ? { error: error.message } : {}
}
