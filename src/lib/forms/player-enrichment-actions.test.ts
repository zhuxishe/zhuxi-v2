import { beforeEach, describe, expect, it, vi } from "vitest"
import { submitSupplementary } from "@/app/app/profile/supplementary/actions"
import { submitPersonality } from "@/app/app/profile/personality/actions"
import { submitQuiz } from "@/app/app/profile/quiz/actions"
import { EMPTY_PERSONALITY, EMPTY_SUPPLEMENTARY } from "@/types"
import { buildDefaultQuizConfig } from "@/lib/constants/personality-quiz"

const mocks = vi.hoisted(() => ({
  requirePlayer: vi.fn(), createClient: vi.fn(), revalidatePath: vi.fn(), getQuizConfig: vi.fn(),
  rpc: vi.fn(), from: vi.fn(), upsert: vi.fn(), select: vi.fn(), single: vi.fn(),
}))
vi.mock("@/lib/auth/player", () => ({ requirePlayer: mocks.requirePlayer }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/lib/queries/quiz-config", () => ({ getQuizConfig: mocks.getQuizConfig }))

const personality = {
  ...EMPTY_PERSONALITY, expression_style_tags: ["幽默"], group_role_tags: ["组织者"], warmup_speed: "快速熟络",
  planning_style: "计划型", coop_compete_tendency: "偏合作", boundary_strength: "适中", reply_speed: "当天",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePlayer.mockResolvedValue({ memberId: "current-player" })
  mocks.rpc.mockResolvedValue({ data: "current-player", error: null })
  mocks.single.mockResolvedValue({ data: { member_id: "current-player" }, error: null })
  mocks.select.mockReturnValue({ single: mocks.single })
  mocks.upsert.mockReturnValue({ select: mocks.select })
  mocks.from.mockReturnValue({ upsert: mocks.upsert })
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc, from: mocks.from })
  mocks.getQuizConfig.mockResolvedValue(buildDefaultQuizConfig())
})

describe("supplementary save boundary", () => {
  it("sends both sections through one authenticated transaction, then refreshes player and admin views", async () => {
    const response = await submitSupplementary({
      ...EMPTY_SUPPLEMENTARY, accept_beginners: false, communication_language_pref: ["中文"], game_type_pref: "都可以",
    })
    expect(response).toEqual({ success: true })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("save_my_supplementary", {
      p_data: expect.objectContaining({ accept_beginners: false, communication_language_pref: ["中文"], game_type_pref: "都可以" }),
    })
    expect(mocks.rpc.mock.calls[0][1].p_data).not.toHaveProperty("member_id")
    expect(mocks.from).not.toHaveBeenCalled()
    for (const path of ["/app", "/app/profile", "/app/profile/supplementary", "/admin", "/admin/members", "/admin/members/current-player"]) {
      expect(mocks.revalidatePath).toHaveBeenCalledWith(path)
    }
  })

  it("does not report success or refresh views when the transaction fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "private database detail" } })
    expect(await submitSupplementary(EMPTY_SUPPLEMENTARY)).toEqual({ error: "saveFailed" })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it("rejects invalid input and never writes it", async () => {
    expect(await submitSupplementary({ ...EMPTY_SUPPLEMENTARY, japanese_level: "unsupported" })).toEqual({ error: "invalidProfileInput" })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })
})

describe("personality save boundary", () => {
  it("cannot store neutral defaults as a completed self-assessment", async () => {
    expect(await submitPersonality(EMPTY_PERSONALITY)).toEqual({ error: "incompletePersonality" })
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it("writes only the authenticated member's assessment and checks the returned member", async () => {
    expect(await submitPersonality(personality)).toEqual({ success: true })
    expect(mocks.from).toHaveBeenCalledWith("member_personality")
    expect(mocks.upsert).toHaveBeenCalledWith({ member_id: "current-player", ...personality }, { onConflict: "member_id" })
    expect(mocks.select).toHaveBeenCalledWith("member_id")
    expect(mocks.single).toHaveBeenCalledOnce()
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/members/current-player")
  })
})

describe("quiz save boundary", () => {
  it("stores the actual current configured answers, scores and type for the current member", async () => {
    const config = buildDefaultQuizConfig()
    config.questions = config.questions.map((question) => ({ ...question, id: question.id + 200 }))
    config.typeLabels.formal.prefix.E = "配置前缀"
    config.typeLabels.formal.suffix.ES = "配置后缀"
    mocks.getQuizConfig.mockResolvedValue(config)
    const answers = config.questions.map((question) => ({ questionId: question.id, score: question.dimension === "E" ? 6 : 1.5 }))
    const response = await submitQuiz(answers)
    expect(response).toEqual({ scores: { E: 100, A: 0, O: 0, C: 0, N: 0 }, personalityType: "配置前缀配置后缀" })
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      member_id: "current-player", answers, score_e: 100, score_a: 0, score_o: 0, score_c: 0, score_n: 0,
      personality_type: "配置前缀配置后缀",
    }), { onConflict: "member_id" })
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app")
  })

  it("rejects incomplete submissions before database access", async () => {
    expect(await submitQuiz([{ questionId: 1, score: 6 }])).toMatchObject({ error: "invalidQuizAnswers" })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it("returns a recoverable error when the database connection rejects", async () => {
    mocks.createClient.mockRejectedValue(new Error("connection dropped"))
    const answers = buildDefaultQuizConfig().questions.map((question) => ({ questionId: question.id, score: 3 }))
    expect(await submitQuiz(answers)).toMatchObject({ error: "submitFailed" })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
