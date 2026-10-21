import type { LocalizedText, QuestionnaireAnswers, QuestionnaireRuntime } from "@/lib/questionnaires/types"
import { answersFromLegacy, answersToLegacy } from "@/lib/questionnaires/defaults"

/** Context is only a version/revision hint. The server resolves the authenticated member. */
export interface QuestionnaireSubmitContext {
  versionId: string
  revision: number
  answers: QuestionnaireAnswers
}

export function questionnaireAnswers(runtime: QuestionnaireRuntime, legacy: object): QuestionnaireAnswers {
  return runtime.isBaseline
    ? { ...runtime.answers, ...answersFromLegacy(runtime.template, legacy as Record<string, unknown>) }
    : runtime.answers
}

export function questionnaireContext(runtime: QuestionnaireRuntime | null | undefined, legacy: object): QuestionnaireSubmitContext | undefined {
  if (!runtime?.versionId) return undefined
  return { versionId: runtime.versionId, revision: runtime.revision, answers: questionnaireAnswers(runtime, legacy) }
}

export function questionnaireLegacy<T extends object>(runtime: QuestionnaireRuntime | null | undefined, legacy: T): T {
  return runtime ? { ...legacy, ...answersToLegacy(runtime.template, runtime.answers) } : legacy
}

export function questionnaireError(error: string | undefined, locale = "zh") {
  if (error && /revision|conflict|changed/i.test(error)) return locale === "ja"
    ? "別の画面で回答が更新されました。ページを再読み込みしてからお試しください。"
    : "回答已在其他页面更新，请刷新页面后再试。"
  return locale === "ja" ? "入力内容を確認して、もう一度お試しください。" : "请检查填写内容后重试。"
}

export function questionnaireText(value: LocalizedText | undefined, locale: string) {
  return locale === "ja" ? value?.ja || value?.zh || "" : value?.zh || value?.ja || ""
}
