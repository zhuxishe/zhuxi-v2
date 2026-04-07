import type { QuizQuestion } from "./personality-quiz"
import { QUIZ_QUESTIONS } from "./personality-quiz"
import { QUIZ_QUESTIONS_JA } from "./personality-quiz-ja"

const QUIZ_MAP: Record<string, QuizQuestion[]> = {
  zh: QUIZ_QUESTIONS,
  ja: QUIZ_QUESTIONS_JA,
}

/** 根据 locale 获取性格测试题目（默认中文） */
export function getQuizQuestions(locale: string): QuizQuestion[] {
  return QUIZ_MAP[locale] ?? QUIZ_QUESTIONS
}
