"use server"

import { requireAdmin } from "@/lib/auth/admin"
import { saveQuizConfig } from "@/lib/queries/quiz-config"
import type { QuizConfig } from "@/types/quiz-config"
import { revalidatePath } from "next/cache"

export async function updateQuizConfig(config: QuizConfig) {
  const admin = await requireAdmin()
  const { error } = await saveQuizConfig(config, admin.email ?? "admin")

  if (error) return { success: false, error }

  revalidatePath("/admin/quiz-config")
  revalidatePath("/app/profile/quiz")
  return { success: true }
}
