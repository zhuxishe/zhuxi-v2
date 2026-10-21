import { beforeEach, describe, expect, it, vi } from "vitest"
import { buildDefaultTemplate } from "./defaults"
import { buildDefaultQuizConfig } from "@/lib/constants/personality-quiz"

const mocked = vi.hoisted(() => ({ rpc: vi.fn(), admin: vi.fn(), auth: vi.fn(), player: vi.fn(), quiz: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocked.admin }))
vi.mock("@/lib/auth/player", () => ({ requireAuth: mocked.auth, requirePlayer: mocked.player }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocked.rpc }) }))
vi.mock("@/lib/queries/quiz-config", () => ({ getQuizConfig: mocked.quiz }))
import { getAdminQuestionnaires, getPlayerQuestionnaire, isQuestionnaireSchemaMissing, publishQuestionnaireDraft, saveQuestionnaireDraft, savePlayerQuestionnaire, startQuestionnaireRetake } from "./server"

const template = buildDefaultTemplate("supplementary")
const runtime = { kind: "supplementary", versionId: "version-1", template, answers: {}, isBaseline: false, completed: false, revision: 3 }

beforeEach(() => {
  vi.resetAllMocks()
  mocked.admin.mockResolvedValue({ role: "admin" })
  mocked.auth.mockResolvedValue({ id: "user" })
  mocked.player.mockResolvedValue({ memberId: "member" })
  mocked.quiz.mockResolvedValue(buildDefaultQuizConfig())
})

describe("questionnaire migration fallback boundary", () => {
  it("only recognizes explicitly missing additive objects", () => {
    expect(isQuestionnaireSchemaMissing({ code: "PGRST202", message: "Could not find the function public.get_my_questionnaire(p_kind) in the schema cache" })).toBe(true)
    expect(isQuestionnaireSchemaMissing({ code: "42P01", message: 'relation "public.questionnaire_templates" does not exist' })).toBe(true)
    expect(isQuestionnaireSchemaMissing({ code: "42P01", message: 'relation "public.member_identity" does not exist' })).toBe(false)
    expect(isQuestionnaireSchemaMissing({ code: "42501", message: "permission denied for questionnaire_templates" })).toBe(false)
    expect(isQuestionnaireSchemaMissing({ code: "PGRST204", message: "Could not find column" })).toBe(false)
  })
  it("preserves the legacy player form before migration", async () => {
    mocked.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find function public.get_my_questionnaire" } })
    await expect(getPlayerQuestionnaire("supplementary")).resolves.toBeNull()
  })
  it("does not silently hide permission, network, timeout or unrelated missing-object errors", async () => {
    for (const error of [{ code: "42501", message: "permission denied" }, { code: "57014", message: "timeout" }, { code: "42P01", message: "relation member_identity does not exist" }]) {
      mocked.rpc.mockResolvedValue({ data: null, error })
      await expect(getPlayerQuestionnaire("supplementary")).rejects.toThrow("Unable to load questionnaire")
    }
  })
  it("leaves uninitialized players on the legacy form without seeding a baseline", async () => {
    mocked.rpc.mockResolvedValue({ data: null, error: null })
    await expect(getPlayerQuestionnaire("supplementary")).resolves.toBeNull()
    expect(mocked.rpc).toHaveBeenCalledTimes(1)
    expect(mocked.rpc).toHaveBeenCalledWith("get_my_questionnaire", { p_kind: "supplementary" })
  })
  it("administrator fallback is also limited to a missing additive RPC", async () => {
    mocked.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find function public.get_admin_questionnaires" } })
    await expect(getAdminQuestionnaires()).resolves.toBeNull()
    expect(mocked.quiz).not.toHaveBeenCalled()
    mocked.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "permission denied" } })
    await expect(getAdminQuestionnaires()).rejects.toThrow("Unable to load questionnaire templates")
  })
})

describe("questionnaire authority and versioned save", () => {
  it("administrator initialization uses the actual legacy quiz configuration", async () => {
    const quiz = buildDefaultQuizConfig();quiz.questions[0].text = "Existing configured question"
    mocked.quiz.mockResolvedValue(quiz)
    mocked.rpc.mockResolvedValue({ data: [], error: null })
    await getAdminQuestionnaires()
    const calls = mocked.rpc.mock.calls.filter(([name]) => name === "initialize_questionnaire_template")
    expect(calls).toHaveLength(4)
    expect(calls.find(([, args]) => args.p_kind === "quiz")?.[1].p_template.questions[0].label.zh).toBe("Existing configured question")
  })
  it("reports a stale draft revision before comparing a newer administrator's questions", async () => {
    const newer = structuredClone(template)
    newer.questions.push({ id: "new_question", sectionId: "location", type: "text", label: { zh: "新题", ja: "新しい質問" }, required: true, active: true, locked: false })
    const rows = ["interview", "supplementary", "personality", "quiz"].map(kind => ({ kind, baseline: buildDefaultTemplate(kind as typeof template.kind), draft: kind === "supplementary" ? newer : buildDefaultTemplate(kind as typeof template.kind), published: buildDefaultTemplate(kind as typeof template.kind), revision: 8, versions: [] }))
    mocked.rpc.mockResolvedValue({ data: rows, error: null })
    await expect(saveQuestionnaireDraft("supplementary", 7, template)).resolves.toEqual({ success: false, error: "QUESTIONNAIRE_REVISION_CONFLICT" })
    expect(mocked.rpc).toHaveBeenCalledTimes(1)
  })
  it("a regular administrator cannot call the publish RPC", async () => {
    await expect(publishQuestionnaireDraft("supplementary", 2)).resolves.toEqual({ success: false, error: "QUESTIONNAIRE_PERMISSION_DENIED" })
    expect(mocked.rpc).not.toHaveBeenCalled()
  })
  it("stale versions are rejected before any write", async () => {
    mocked.rpc.mockResolvedValue({ data: runtime, error: null })
    await expect(savePlayerQuestionnaire("supplementary", "different-version", {})).resolves.toEqual({ success: false, error: "QUESTIONNAIRE_VERSION_CONFLICT" })
    expect(mocked.rpc).toHaveBeenCalledTimes(1)
  })
  it("normalizes boolean selections and carries the answer revision to one atomic RPC", async () => {
    mocked.rpc.mockResolvedValueOnce({ data: runtime, error: null }).mockResolvedValueOnce({ data: { ...runtime, revision: 4, completed: true, answers: { accept_beginners: false } }, error: null })
    const saved = await savePlayerQuestionnaire("supplementary", "version-1", { accept_beginners: "false" })
    expect(saved.success).toBe(true)
    expect(mocked.rpc).toHaveBeenLastCalledWith("save_my_questionnaire", expect.objectContaining({ p_kind: "supplementary", p_version_id: "version-1", p_answers: { accept_beginners: false }, p_complete: true, p_expected_revision: 3 }))
  })
  it("surfaces optimistic conflicts without retrying against a newer version", async () => {
    mocked.rpc.mockResolvedValueOnce({ data: runtime, error: null }).mockResolvedValueOnce({ data: null, error: { code: "PT409", message: "QUESTIONNAIRE_REVISION_CONFLICT" } })
    await expect(savePlayerQuestionnaire("supplementary", "version-1", {})).resolves.toEqual({ success: false, error: "QUESTIONNAIRE_REVISION_CONFLICT" })
    expect(mocked.rpc).toHaveBeenCalledTimes(2)
  })
  it("retakes use the explicit start RPC and never hide unrelated errors", async () => {
    const quizRuntime = { ...runtime, kind: "quiz", template: buildDefaultTemplate("quiz") }
    mocked.rpc.mockResolvedValueOnce({ data: quizRuntime, error: null })
    await expect(startQuestionnaireRetake("quiz")).resolves.toEqual(quizRuntime)
    expect(mocked.rpc).toHaveBeenCalledWith("start_my_questionnaire_retake", { p_kind: "quiz" })
    mocked.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "permission denied" } })
    await expect(startQuestionnaireRetake("quiz")).rejects.toThrow("Unable to start questionnaire retake")
  })
})
