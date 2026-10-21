import type { Dimension, QuizConfig } from "@/types/quiz-config"

export const QUESTIONNAIRE_KINDS = ["interview", "supplementary", "personality", "quiz"] as const
export type QuestionnaireKind = typeof QUESTIONNAIRE_KINDS[number]
export const QUESTION_TYPES = ["text", "textarea", "single", "multi", "number", "date", "rating"] as const
export type QuestionType = typeof QUESTION_TYPES[number]
export interface LocalizedText { zh: string; ja: string }
export interface QuestionnaireOption { id: string; value: string; label: LocalizedText; score?: number }
export interface QuestionnaireSection { id: string; title: LocalizedText }
export interface QuestionnaireQuestion {
  id: string
  builtinField?: string
  sectionId: string
  type: QuestionType
  label: LocalizedText
  description?: LocalizedText
  required: boolean
  active: boolean
  options?: QuestionnaireOption[]
  min?: number
  max?: number
  maxLength?: number
  maxSelections?: number
  locked: boolean
  dimension?: Dimension
}
export interface QuestionnaireTemplate {
  kind: QuestionnaireKind
  title: LocalizedText
  sections: QuestionnaireSection[]
  questions: QuestionnaireQuestion[]
  quizConfig?: QuizConfig
}
export type QuestionnaireAnswer = string | string[] | number | boolean | null
export type QuestionnaireAnswers = Record<string, QuestionnaireAnswer>
export interface QuestionnaireRuntime {
  kind: QuestionnaireKind
  versionId: string | null
  template: QuestionnaireTemplate
  answers: QuestionnaireAnswers
  isBaseline: boolean
  completed: boolean
  revision: number
}
export interface QuestionnaireVersionSummary { id: string; version: number; createdAt: string; createdBy?: string }
export interface AdminQuestionnaire {
  kind: QuestionnaireKind
  baseline: QuestionnaireTemplate
  draft: QuestionnaireTemplate | null
  published: QuestionnaireTemplate | null
  revision: number
  versions: QuestionnaireVersionSummary[]
}
export interface ValidationIssue { path: string; message: string }
export type ValidationResult<T> = { ok: true; data: T } | { ok: false; error: string; issues: ValidationIssue[] }
export interface AnswerValidationOptions {
  /** Validate only this section, retaining trusted answers from other sections. */
  sectionId?: string
  existingAnswers?: QuestionnaireAnswers
  /** For saving a draft: values must still be valid, but missing required answers are accepted. */
  allowIncomplete?: boolean
}

export type Template = QuestionnaireTemplate
export type Question = QuestionnaireQuestion
export type Runtime = QuestionnaireRuntime
export type Answers = QuestionnaireAnswers
