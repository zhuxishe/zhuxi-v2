import { beforeEach, describe, expect, it, vi } from "vitest"
import { buildDefaultTemplate } from "@/lib/questionnaires/defaults"

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(), save: vi.fn(), publish: vi.fn(), revalidatePath: vi.fn(),
}))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock("@/lib/questionnaires/server", () => ({ saveQuestionnaireDraft: mocks.save, publishQuestionnaireDraft: mocks.publish }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
import { publishTemplate, saveTemplateDraft, updateQuizConfig } from "./actions"

describe("questionnaire administration boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ id: "admin", role: "admin" })
    mocks.save.mockResolvedValue({ success: true, draft: {} })
    mocks.publish.mockResolvedValue({ success: true, draft: {} })
  })
  it("lets an ordinary administrator save a draft without invalidating player routes", async () => {
    const draft = buildDefaultTemplate("interview")
    expect((await saveTemplateDraft("interview", 3, draft)).success).toBe(true)
    expect(mocks.save).toHaveBeenCalledWith("interview", 3, draft)
    expect(mocks.revalidatePath).toHaveBeenCalledExactlyOnceWith("/admin/quiz-config")
    expect(mocks.publish).not.toHaveBeenCalled()
  })
  it("refuses publication by an ordinary administrator before calling the database", async () => {
    expect((await publishTemplate("quiz", 2)).success).toBe(false)
    expect(mocks.publish).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
  it("publishes only for a super administrator and leaves activity routes untouched", async () => {
    mocks.requireAdmin.mockResolvedValue({ role: "super_admin" })
    expect((await publishTemplate("supplementary", 4)).success).toBe(true)
    expect(mocks.publish).toHaveBeenCalledWith("supplementary", 4)
    expect(mocks.revalidatePath.mock.calls.flat()).toEqual([
      "/admin/quiz-config", "/app/interview-form", "/app/profile/supplementary", "/app/profile/personality", "/app/profile/quiz",
    ])
  })
  it("fails closed for stale database responses without claiming publication succeeded", async () => {
    mocks.requireAdmin.mockResolvedValue({ role: "super_admin" })
    mocks.publish.mockResolvedValue({ success: false, error: "配置已变更，请刷新" })
    expect(await publishTemplate("personality", 1)).toEqual({ success: false, error: "配置已变更，请刷新" })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
  it("does not allow the old direct-save action to bypass the draft workflow", async () => {
    const config = buildDefaultTemplate("quiz").quizConfig!
    expect((await updateQuizConfig(config)).success).toBe(false)
    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.publish).not.toHaveBeenCalled()
  })
  it("rejects forged questionnaire categories and invalid revisions", async () => {
    const draft = buildDefaultTemplate("interview")
    expect((await saveTemplateDraft("registration" as never, 1, draft)).success).toBe(false)
    expect((await saveTemplateDraft("interview", -1, draft)).success).toBe(false)
    expect((await saveTemplateDraft("interview", NaN, draft)).success).toBe(false)
    expect(mocks.save).not.toHaveBeenCalled()
  })
})
