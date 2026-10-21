import type { QuestionnaireKind } from "@/lib/questionnaires/types"
import { answersFromLegacy } from "@/lib/questionnaires/defaults"
import type { QuestionnaireSubmitContext } from "./questionnaire-client"

/** Old web callers must also honor an initialized template's required questions. */
export async function resolveQuestionnaireSubmission(kind: QuestionnaireKind, context: QuestionnaireSubmitContext | undefined, legacy: object = {}): Promise<QuestionnaireSubmitContext | undefined> {
  if (context) return context
  const { getPlayerQuestionnaire } = await import("@/lib/questionnaires/server")
  const runtime = await getPlayerQuestionnaire(kind)
  if (!runtime?.versionId) return undefined
  return {
    versionId: runtime.versionId,
    revision: runtime.revision,
    answers: { ...runtime.answers, ...answersFromLegacy(runtime.template, legacy as Record<string, unknown>) },
  }
}
