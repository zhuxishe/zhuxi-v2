import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ player: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }))
vi.mock("@/lib/auth/player", () => ({ requirePlayer: mocks.player }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
vi.mock("@/lib/activity-reviews/queries", () => ({ activityReviewRpc: mocks.rpc, activityReviewErrorCode: (error: unknown) => error instanceof Error ? error.message : "PEER_SAVE_FAILED" }))
import { submitActivityReviewAction, submitActivityNoMatchRequestAction } from "@/app/app/matches/rounds/[roundId]/reviews/actions"
const roundId = "10000000-0000-4000-8000-000000000001", targetMemberId = "10000000-0000-4000-8000-000000000002", requestId = "10000000-0000-4000-8000-000000000003"
beforeEach(() => { vi.resetAllMocks(); mocks.player.mockResolvedValue({ memberId: "self" }); mocks.rpc.mockResolvedValue({}) })
describe("v2 authenticated feedback endpoints", () => {
  it("saves an interaction-confirmed one-point score through v2 without requiring a report", async () => {
    await submitActivityReviewAction({ roundId, targetMemberId, policyVersion: "unified_v2", operation: "save", requestId, interactionConfirmed: true, review: { score: 1, comment: "本次体验较差", expectedVersion: 0 } })
    expect(mocks.rpc).toHaveBeenCalledWith("player_submit_round_peer_feedback_v2", expect.objectContaining({ p_score: 1, p_interaction_confirmed: true, p_report_category: null, p_request_id: requestId }))
  })
  it("refuses an unconfirmed rating before invoking its write RPC", async () => {
    expect(await submitActivityReviewAction({ roundId, targetMemberId, policyVersion: "unified_v2", operation: "save", review: { score: 5, comment: "", expectedVersion: 0 } })).toEqual({ error: "PEER_INTERACTION_REQUIRED" })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("keeps report-only feedback independent of a score and interaction checkbox", async () => {
    await submitActivityReviewAction({ roundId, targetMemberId, policyVersion: "unified_v2", operation: "save", report: { category: "other", detail: "需要管理员核实的具体情况说明", expectedVersion: 0 } })
    expect(mocks.rpc).toHaveBeenCalledWith("player_submit_round_peer_feedback_v2", expect.objectContaining({ p_score: null, p_interaction_confirmed: false }))
  })
  it("submits independent requests using authenticated identity and strips moderation details", async () => {
    mocks.rpc.mockResolvedValue({ id: requestId, target_member_id: targetMemberId, reason: "", status: "pending", version: 1, created_at: "2026-11-24T00:00:00Z", updated_at: "2026-11-24T00:00:00Z", internal_note: "PRIVATE", actor_admin_id: "PRIVATE" })
    const result = await submitActivityNoMatchRequestAction({ roundId, targetMemberId, requestId, interactionConfirmed: true, reason: "" })
    expect(result.success).toBe(true)
    expect(JSON.stringify(result)).not.toContain("PRIVATE")
    expect(mocks.rpc).toHaveBeenCalledWith("player_submit_peer_no_match_request", { p_round_id: roundId, p_target_member_id: targetMemberId, p_reason: "", p_request_id: requestId, p_interaction_confirmed: true })
    expect(mocks.revalidate).not.toHaveBeenCalledWith("/app/matching/survey")
  })
  it("requires player authentication and confirmation for requests", async () => {
    expect(await submitActivityNoMatchRequestAction({ roundId, targetMemberId, requestId, interactionConfirmed: false, reason: "" })).toEqual({ error: "PEER_INTERACTION_REQUIRED" })
    expect(mocks.rpc).not.toHaveBeenCalled()
    mocks.player.mockRejectedValueOnce(new Error("login redirect"))
    await expect(submitActivityNoMatchRequestAction({ roundId, targetMemberId, requestId, interactionConfirmed: true, reason: "" })).rejects.toThrow("login redirect")
  })
})
