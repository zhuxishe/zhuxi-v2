import type { RoundQuestion, SurveyAnswers } from "@/types/matching-round"

/** Compare the visible answers as they are saved, ignoring multi-choice order. */
export function registrationAnswersChanged(questions: RoundQuestion[], previous: SurveyAnswers["customAnswers"], current: SurveyAnswers["customAnswers"]) {
  return questions.some((question) => {
    const before = previous[question.id], after = current[question.id]
    if (question.type === "multi") {
      const left = Array.isArray(before) ? [...before].sort() : []
      const right = Array.isArray(after) ? [...after].sort() : []
      return JSON.stringify(left) !== JSON.stringify(right)
    }
    const left = typeof before === "string" ? before : ""
    const right = typeof after === "string" ? after : ""
    return question.type === "text" ? left.trim() !== right.trim() : left !== right
  })
}
