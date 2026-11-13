import type { QuestionnaireAnswers, QuestionnaireTemplate } from "@/lib/questionnaires/types"

export type InterviewQuestionnaire =
  | { status: "missing" | "draft" | "unavailable" }
  | {
    status: "submitted" | "legacy"
    template: QuestionnaireTemplate
    answers: QuestionnaireAnswers
    version: number | null
    submittedAt: string | null
  }
