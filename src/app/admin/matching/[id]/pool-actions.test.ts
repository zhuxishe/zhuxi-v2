import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(), createClient: vi.fn(), revalidatePath: vi.fn(), fetchCancelledPoolIds: vi.fn(),
  buildRoundCandidates: vi.fn(), fetchPairRelations: vi.fn(), runFullMatching: vi.fn(), syncSessionSummary: vi.fn(),
}))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }))
vi.mock("@/lib/queries/cancelled-pool", () => ({ fetchCancelledPoolIds: mocks.fetchCancelledPoolIds }))
vi.mock("@/lib/matching/build-round-candidates", () => ({ buildRoundCandidates: mocks.buildRoundCandidates }))
vi.mock("@/lib/queries/pair-relations-build", () => ({ fetchPairRelations: mocks.fetchPairRelations }))
vi.mock("@/lib/matching/run-matching", () => ({ runFullMatching: mocks.runFullMatching }))
vi.mock("@/lib/matching/session-summary-sync", () => ({ syncSessionSummary: mocks.syncSessionSummary }))
import { runPoolRematch } from "./pool-actions"
const reason = "核实取消池成员后运行匹配"

function database(status: string, writeError: { code?: string; message: string } | null = null) {
  const insert = vi.fn().mockResolvedValue({ data: null, error: writeError })
  return {
    insert,
    db: { from: vi.fn((table: string) => table === "match_sessions"
      ? { select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { status, round_id: "round" }, error: null }) })) })) }
      : { insert }) },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireAdmin.mockResolvedValue({ id: "admin" })
  mocks.fetchCancelledPoolIds.mockResolvedValue(["A", "B"])
  mocks.buildRoundCandidates.mockResolvedValue({ candidates: [] })
  mocks.fetchPairRelations.mockResolvedValue(new Map())
  mocks.runFullMatching.mockReturnValue({ rows: [{ member_a_id: "A", member_b_id: "B", group_members: null, total_score: 30, score_breakdown: {}, rank: 1, best_slot: "2026-10-24_下午" }] })
})

describe("pool rematch publication protection", () => {
  it("stops before reading the pool or running the algorithm when published", async () => {
    const { db, insert } = database("confirmed")
    mocks.createClient.mockResolvedValue(db)
    await expect(runPoolRematch("session", reason)).resolves.toEqual({ error: "该匹配已发布，请先撤回发布后再调整" })
    expect(mocks.fetchCancelledPoolIds).not.toHaveBeenCalled()
    expect(mocks.runFullMatching).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })

  it("retains the existing draft algorithm and draft result insert", async () => {
    const { db, insert } = database("draft")
    mocks.createClient.mockResolvedValue(db)
    await expect(runPoolRematch("session", reason)).resolves.toEqual({ success: true, matchCount: 1 })
    expect(mocks.runFullMatching).toHaveBeenCalledTimes(1)
    expect(insert).toHaveBeenCalledWith([expect.objectContaining({ status: "draft", session_id: "session", best_slot: "2026-10-24_下午" })])
  })

  it("does not claim a successful rematch when publication wins the write race", async () => {
    const { db } = database("draft", { code: "PT409", message: "MATCH_PUBLICATION_REQUIRES_WITHDRAWAL" })
    mocks.createClient.mockResolvedValue(db)
    await expect(runPoolRematch("session", reason)).resolves.toEqual({ error: "该匹配已发布，请先撤回发布后再调整" })
    expect(mocks.syncSessionSummary).not.toHaveBeenCalled()
  })
})
