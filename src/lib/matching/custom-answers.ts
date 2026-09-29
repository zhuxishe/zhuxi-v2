import type { RoundQuestion } from "@/types/matching-round"

export function validateCustomAnswers(questions: RoundQuestion[], value: unknown) {
  const source = value === undefined ? {} : value
  if (!source || typeof source !== "object" || Array.isArray(source)) return { error: "invalidSurveyInput" } as const
  const answers = source as Record<string, unknown>
  if (Object.keys(answers).some((id) => !questions.some((question) => question.id === id))) {
    return { error: "invalidSurveyInput" } as const
  }
  const result: Record<string, string | string[]> = {}
  for (const question of questions) {
    const answer = answers[question.id]
    const empty = answer === undefined || answer === "" || (typeof answer === "string" && !answer.trim())
      || (Array.isArray(answer) && answer.length === 0)
    if (empty) {
      if (question.required) return { error: "customQuestionRequired" } as const
      continue
    }
    if (question.type === "text") {
      if (typeof answer !== "string" || answer.length > 2000) return { error: "invalidSurveyInput" } as const
      result[question.id] = answer.trim()
    } else if (question.type === "single") {
      if (typeof answer !== "string" || !question.options.some((option) => option.id === answer)) {
        return { error: "invalidSurveyInput" } as const
      }
      result[question.id] = answer
    } else if (question.type === "multi") {
      if (!Array.isArray(answer) || answer.length > question.options.length || new Set(answer).size !== answer.length
        || answer.some((id) => typeof id !== "string" || !question.options.some((option) => option.id === id))) {
        return { error: "invalidSurveyInput" } as const
      }
      result[question.id] = answer
    } else return { error: "invalidSurveyInput" } as const
  }
  // Leave room for PostgreSQL's JSON spacing as well as multi-byte user text.
  if (new TextEncoder().encode(JSON.stringify(result)).length > 49000) return { error: "invalidSurveyInput" } as const
  return { data: result } as const
}
