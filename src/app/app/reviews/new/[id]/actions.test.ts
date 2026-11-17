import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ match: vi.fn(), insert: vi.fn(), revalidate: vi.fn(), reviewRoute: vi.fn() }))
vi.mock("@/lib/auth/player", () => ({ requirePlayer: async () => ({ memberId: "me" }) }))
vi.mock("@/lib/queries/matching", () => ({ fetchMatchDetail: mocks.match }))
vi.mock("@/lib/queries/reviews", () => ({ fetchMatchReviewRoute: mocks.reviewRoute }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({
  select: () => { const q = { eq: () => q, maybeSingle: async () => ({ data: null }) }; return q }, insert: mocks.insert,
}) }) }))
import { submitReview } from "./actions"

const input = { match_result_id: "result", reviewee_id: "partner", expected_publication_version: 2,
  overall_score: 3, punctuality_score: 3, communication_score: 3, teamwork_score: 3, fun_score: 3,
  would_play_again: true, positive_tags: [], negative_tags: [], comment: "保留填写内容" }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.match.mockResolvedValue({ status: "confirmed", publication_version: 2, member_a_id: "me", member_b_id: "partner", group_members: null })
  mocks.insert.mockResolvedValue({ error: null })
  mocks.reviewRoute.mockResolvedValue({ reviewSystem: "legacy", roundId: null, reviewed: false })
})
describe("legacy review publication protection", () => {
  it("persists the displayed publication version together with an owned published pair review", async () => {
    expect(await submitReview(input)).toEqual({ success: true })
    expect(mocks.match).toHaveBeenCalledWith("result", "me")
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ match_publication_version: 2, reviewer_id: "me", reviewee_id: "partner", comment: input.comment }))
  })
  it.each([null, { status: "cancelled", publication_version: 2 }])("refuses missing, withdrawn or ended results without inserting", async (match) => {
    mocks.match.mockResolvedValue(match)
    expect(await submitReview(input)).toEqual({ error: "matchNotFound" })
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it("refuses a stale V1 form after a V2 publication even if the same result ID is reused", async () => {
    expect(await submitReview({ ...input, expected_publication_version: 1 })).toEqual({ error: "matchPublicationChanged" })
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it("returns the publication conflict if withdrawal races with insertion", async () => {
    mocks.insert.mockResolvedValue({ error: { message: "MATCH_PUBLICATION_STALE" } })
    expect(await submitReview(input)).toEqual({ error: "matchPublicationChanged" })
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
  it("sends a stale legacy form to the unified activity without writing five scores", async () => {
    const roundId = "30000000-0000-0000-0000-000000000002"
    mocks.reviewRoute.mockResolvedValue({ reviewSystem: "unified", roundId, reviewed: false })
    expect(await submitReview(input)).toEqual({ redirectTo: `/app/matches/rounds/${roundId}/reviews` })
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
  it("does not insert through the legacy action when routing lookup fails", async () => {
    mocks.reviewRoute.mockRejectedValue(new Error("routing unavailable"))
    await expect(submitReview(input)).rejects.toThrow("routing unavailable")
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it("uses the authoritative new route when the database rejects the old writer", async () => {
    mocks.reviewRoute.mockResolvedValueOnce({ reviewSystem: "legacy", roundId: null, reviewed: false })
      .mockResolvedValueOnce({ reviewSystem: "unified", roundId: "round", reviewed: false })
    mocks.insert.mockResolvedValue({ error: { message: "PEER_UNIFIED_REVIEW_REQUIRED" } })
    expect(await submitReview(input)).toEqual({ redirectTo: "/app/matches/rounds/round/reviews" })
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
})
