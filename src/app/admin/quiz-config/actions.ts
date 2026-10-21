"use server"

import { requireAdmin } from "@/lib/auth/admin"
import { publishQuestionnaireDraft, saveQuestionnaireDraft } from "@/lib/questionnaires/server"
import { QUESTIONNAIRE_KINDS, type QuestionnaireKind, type QuestionnaireTemplate } from "@/lib/questionnaires/types"
import type { QuizConfig } from "@/types/quiz-config"
import { revalidatePath } from "next/cache"

export async function saveTemplateDraft(kind: QuestionnaireKind, revision: number, template: QuestionnaireTemplate) {
  await requireAdmin()
  if (!QUESTIONNAIRE_KINDS.includes(kind) || !Number.isSafeInteger(revision) || revision < 0) {
    return { success: false as const, error: "问卷或配置版本无效，请刷新后重试" }
  }
  const result = await saveQuestionnaireDraft(kind, revision, template)
  if (result.success) revalidatePath("/admin/quiz-config")
  return result
}

export async function publishTemplate(kind: QuestionnaireKind, revision: number) {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { success: false as const, error: "只有超级管理员可以发布问卷" }
  if (!QUESTIONNAIRE_KINDS.includes(kind) || !Number.isSafeInteger(revision) || revision < 0) {
    return { success: false as const, error: "问卷或配置版本无效，请刷新后重试" }
  }
  const result = await publishQuestionnaireDraft(kind, revision)
  if (result.success) {
    revalidatePath("/admin/quiz-config")
    for (const path of ["/app/interview-form", "/app/profile/supplementary", "/app/profile/personality", "/app/profile/quiz"]) revalidatePath(path)
  }
  return result
}

/** Old open tabs must not bypass drafts, publication roles or version history. */
export async function updateQuizConfig(_config: QuizConfig) {
  await requireAdmin()
  return { success: false, error: "问卷配置已升级，请刷新页面，在通用问卷中保存草稿并发布" }
}
