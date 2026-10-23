import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), createClient: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }))

import { fetchMemberCompositeScores, updateMemberCompositeScores } from "./member-composite-scores"

const empty = {
  member_id: "member-id", attractiveness_score: null, sexual_value_score: null,
  economic_value_score: null, emotional_value_score: null, updated_at: null,
}

describe("composite score RPC contract", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc })
    mocks.rpc.mockResolvedValue({ data: empty, error: null })
  })

  it("reads through the admin RPC without converting missing scores into saved defaults", async () => {
    expect(await fetchMemberCompositeScores("member-id")).toEqual(empty)
    expect(mocks.rpc).toHaveBeenCalledWith("admin_get_member_composite_scores", { p_member_id: "member-id" })
  })

  it("keeps closed profiles readable but does not swallow authorization or database errors", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "COMPOSITE_SCORE_MEMBER_UNAVAILABLE" } })
    expect(await fetchMemberCompositeScores("member-id")).toBeNull()
    for (const message of ["MEMBER_MASTER_ADMIN_REQUIRED", "permission denied", "connection failure"]) {
      mocks.rpc.mockResolvedValueOnce({ data: null, error: { message } })
      await expect(fetchMemberCompositeScores("member-id")).rejects.toThrow(message)
    }
  })

  it("sends all four scores and the original version to the independent write RPC", async () => {
    const scores = { attractiveness_score: 1, sexual_value_score: 2, economic_value_score: 3, emotional_value_score: 4 }
    const updatedAt = "2026-10-23T09:15:00Z"
    const result = { ...empty, ...scores, updated_at: updatedAt }
    mocks.rpc.mockResolvedValueOnce({ data: result, error: null })
    expect(await updateMemberCompositeScores({ memberId: "member-id", scores, reason: "综合评分复核", expectedUpdatedAt: null }))
      .toEqual(result)
    expect(mocks.rpc).toHaveBeenCalledWith("admin_update_member_composite_scores", {
      p_member_id: "member-id", p_scores: scores, p_reason: "综合评分复核", p_expected_updated_at: null,
    })
  })
})
