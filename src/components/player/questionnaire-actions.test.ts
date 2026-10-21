import { beforeEach, describe, expect, it, vi } from "vitest"
import { buildDefaultTemplate, quizAnswersFromTemplate, quizTemplateToConfig } from "@/lib/questionnaires/defaults"
import { calculateScores } from "@/lib/constants/personality-quiz"
import type { QuestionnaireKind, QuestionnaireRuntime } from "@/lib/questionnaires/types"
import { EMPTY_PERSONALITY, EMPTY_SUPPLEMENTARY } from "@/types"

const mocks = vi.hoisted(() => ({ requirePlayer: vi.fn(), requireAuth: vi.fn(), get: vi.fn(), save: vi.fn(), retake: vi.fn(), createClient: vi.fn(), latestQuiz: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/player", () => ({ requirePlayer: mocks.requirePlayer, requireAuth: mocks.requireAuth }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }))
vi.mock("@/lib/queries/quiz-config", () => ({ getQuizConfig: mocks.latestQuiz }))
vi.mock("@/lib/questionnaires/server", () => ({ getPlayerQuestionnaire: mocks.get, savePlayerQuestionnaire: mocks.save, startQuestionnaireRetake: mocks.retake }))

import { savePreInterviewStep, submitPreInterviewForm } from "@/app/app/interview-form/actions"
import { submitSupplementary } from "@/app/app/profile/supplementary/actions"
import { submitPersonality } from "@/app/app/profile/personality/actions"
import { startQuizRetake, submitQuiz } from "@/app/app/profile/quiz/actions"

function runtime(kind: QuestionnaireKind): QuestionnaireRuntime {
  return { kind, versionId: `${kind}-pinned-v1`, template: buildDefaultTemplate(kind), answers: {}, isBaseline: false, completed: false, revision: 7 }
}
const context = { versionId: "pinned-old-version", revision: 7, answers: { custom_question: "kept" } }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePlayer.mockResolvedValue({ memberId: "authenticated-member" })
  mocks.requireAuth.mockResolvedValue({ id: "authenticated-user" })
  mocks.get.mockResolvedValue(null)
})

describe("versioned player submit boundary", () => {
  it.each(["supplementary", "personality"] as const)("%s saves the complete pinned answer map with expected revision", async (kind) => {
    const saved = { ...runtime(kind), revision: 8 }
    mocks.save.mockResolvedValue({ success: true, runtime: saved })
    const result = kind === "supplementary" ? await submitSupplementary(EMPTY_SUPPLEMENTARY, context) : await submitPersonality(EMPTY_PERSONALITY, context)
    expect(result).toEqual({ success: true, questionnaire: saved })
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(kind, "pinned-old-version", context.answers, { complete: true, expectedRevision: 7 })
    expect(mocks.get).not.toHaveBeenCalled()
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(JSON.stringify(mocks.save.mock.calls)).not.toContain("authenticated-member")
  })

  it("cannot bypass newly required questions by omitting the optional web context", async () => {
    const current = runtime("supplementary")
    current.template.questions.push({ id: "custom_question", sectionId: "social", type: "text", label: { zh: "新必填", ja: "必須" }, required: true, active: true, locked: false })
    mocks.get.mockResolvedValue(current)
    mocks.save.mockResolvedValue({ success: false, error: "required_answer" })
    expect(await submitSupplementary(EMPTY_SUPPLEMENTARY)).toEqual({ error: "required_answer" })
    expect(mocks.save).toHaveBeenCalledWith("supplementary", current.versionId, expect.not.objectContaining({ custom_question: expect.anything() }), { complete: true, expectedRevision: 7 })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it("does not fall back to legacy writes after a runtime read failure", async () => {
    mocks.get.mockRejectedValue(new Error("database unavailable"))
    expect(await submitPersonality(EMPTY_PERSONALITY)).toEqual({ error: "saveFailed" })
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it("surfaces a concurrent revision conflict and never retries against latest", async () => {
    mocks.save.mockResolvedValue({ success: false, error: "revision_conflict" })
    expect(await submitSupplementary(EMPTY_SUPPLEMENTARY, context)).toEqual({ error: "revision_conflict" })
    expect(mocks.get).not.toHaveBeenCalled()
    expect(mocks.save).toHaveBeenCalledOnce()
  })

  it("saves one interview section, returns the revision, then atomically completes the pinned version", async () => {
    const saved = { ...runtime("interview"), revision: 8 }
    mocks.save.mockResolvedValue({ success: true, runtime: saved })
    expect(await savePreInterviewStep(2, {}, context)).toMatchObject({ success: true, onboardingStep: 2, questionnaire: saved })
    expect(mocks.save).toHaveBeenLastCalledWith("interview", context.versionId, context.answers, { step: 2, expectedRevision: 7 })
    await submitPreInterviewForm({ ...context, revision: saved.revision })
    expect(mocks.save).toHaveBeenLastCalledWith("interview", context.versionId, context.answers, { complete: true, expectedRevision: 8 })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it("uses existing pinned answers for an old-signature final interview submit", async () => {
    const pinned = runtime("interview")
    pinned.answers = { full_name: "本人", custom_question: "曾保存的答案" }
    mocks.get.mockResolvedValue(pinned)
    mocks.save.mockResolvedValue({ success: true, runtime: pinned })
    expect(await submitPreInterviewForm()).toEqual({ success: true })
    expect(mocks.save).toHaveBeenCalledWith("interview", pinned.versionId, pinned.answers, { complete: true, expectedRevision: 7 })
  })
})

describe("quiz version and explicit retake", () => {
  it("uses saved version scoring instead of reading the newest config at submit time", async () => {
    const pinned = runtime("quiz")
    pinned.template.questions[0].options![0].score = 8
    pinned.answers = Object.fromEntries(pinned.template.questions.map((question) => [question.id, question.options![0].value]))
    mocks.save.mockResolvedValue({ success: true, runtime: { ...pinned, revision: 8, completed: true } })
    const result = await submitQuiz([], { versionId: pinned.versionId!, revision: 7, answers: pinned.answers })
    const config = quizTemplateToConfig(pinned.template)
    expect(result.scores).toEqual(calculateScores(quizAnswersFromTemplate(pinned.template, pinned.answers), config.scoring, config.questions))
    expect(result.questionnaire?.versionId).toBe(pinned.versionId)
    expect(mocks.latestQuiz).not.toHaveBeenCalled()
    expect(mocks.get).not.toHaveBeenCalled()
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it("starts a fresh latest-version session only through the explicit retake action", async () => {
    const latest = { ...runtime("quiz"), versionId: "new-published-version", revision: 0 }
    mocks.retake.mockResolvedValue(latest)
    expect(await startQuizRetake()).toEqual({ questionnaire: latest })
    expect(mocks.requirePlayer).toHaveBeenCalledOnce()
    expect(mocks.retake).toHaveBeenCalledExactlyOnceWith("quiz")
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it("keeps retake failures recoverable without overwriting any previous result", async () => {
    mocks.retake.mockRejectedValue(new Error("transport failed"))
    expect(await startQuizRetake()).toEqual({ error: "submitFailed" })
    expect(mocks.save).not.toHaveBeenCalled()
  })
})
