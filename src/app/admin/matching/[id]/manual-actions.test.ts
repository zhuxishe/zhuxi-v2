import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MatchCandidate } from "@/lib/matching/types"

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(), createClient: vi.fn(), revalidatePath: vi.fn(),
  buildRoundCandidates: vi.fn(), fetchPairRelations: vi.fn(), syncSessionSummary: vi.fn(),
}))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }))
vi.mock("@/lib/matching/build-round-candidates", () => ({ buildRoundCandidates: mocks.buildRoundCandidates }))
vi.mock("@/lib/queries/pair-relations-build", () => ({ fetchPairRelations: mocks.fetchPairRelations }))
vi.mock("@/lib/matching/session-summary-sync", () => ({ syncSessionSummary: mocks.syncSessionSummary }))

import { manualPair } from "./manual-actions"

const sessionId = "10000000-0000-4000-8000-000000000001"
const memberIds = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"]
const reason = "管理员核对后手动配对"
type OccupancyResponse = { data: { id: string }[] | null; error: { message: string } | null }

function createDb(responses: OccupancyResponse[]) {
  const pending = [...responses]
  const lookup = vi.fn(() => {
    const response = pending.shift()
    if (!response) throw new Error("Unexpected occupancy lookup")
    return Promise.resolve(response)
  })
  const chain = {
    eq: vi.fn(), neq: vi.fn(), or: vi.fn(), contains: vi.fn(), limit: lookup,
  }
  for (const method of [chain.eq, chain.neq, chain.or, chain.contains]) method.mockReturnValue(chain)
  const insert = vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { id: "new-result" }, error: null }) })) }))
  const db = {
    from: vi.fn((table: string) => {
      if (table === "match_sessions") return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { round_id: "round-id" }, error: null }) })) })),
      }
      if (table === "match_results") return { select: vi.fn(() => chain), insert }
      throw new Error(`Unexpected table: ${table}`)
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
  return { db, insert, lookup }
}

describe("manual matching occupancy checks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ id: "admin-id", role: "super_admin" })
  })

  it.each([0, 1, 2, 3])("does not insert when occupancy lookup %i fails", async (failedIndex) => {
    const responses: OccupancyResponse[] = Array.from({ length: failedIndex }, () => ({ data: [], error: null }))
    responses.push({ data: null, error: { message: "lookup failed" } })
    const { db, insert, lookup } = createDb(responses)
    mocks.createClient.mockResolvedValue(db)

    await expect(manualPair(sessionId, memberIds, reason)).resolves.toEqual({ error: "无法检查成员当前配对，请稍后重试" })
    expect(lookup).toHaveBeenCalledTimes(failedIndex + 1)
    expect(insert).not.toHaveBeenCalled()
    expect(mocks.buildRoundCandidates).not.toHaveBeenCalled()
  })

  it("also stops when the lookup returns no usable response", async () => {
    const { db, insert } = createDb([{ data: null, error: null }])
    mocks.createClient.mockResolvedValue(db)
    await expect(manualPair(sessionId, memberIds, reason)).resolves.toEqual({ error: "无法检查成员当前配对，请稍后重试" })
    expect(insert).not.toHaveBeenCalled()
  })

  it("keeps rejecting members already assigned to an active pair", async () => {
    const { db, insert } = createDb([{ data: [{ id: "existing" }], error: null }])
    mocks.createClient.mockResolvedValue(db)
    await expect(manualPair(sessionId, memberIds, reason)).resolves.toEqual({ error: "成员已在此次匹配中有活跃配对，请先拆分旧配对" })
    expect(insert).not.toHaveBeenCalled()
  })

  it("still allows two unoccupied members with a common time slot", async () => {
    const { db, insert } = createDb(Array.from({ length: 4 }, () => ({ data: [], error: null })))
    mocks.createClient.mockResolvedValue(db)
    const candidates: MatchCandidate[] = memberIds.map((id) => ({
      submissionId: id, name: id, gameTypePref: "双人", genderPref: "都可以",
      availability: { "2026-10-10": ["下午"] }, formInterestTags: [], formSocialStyle: null,
      gender: "male", school: "测试大学", interestTags: [], socialTags: [], level: 1,
      compatibilityScore: 4, matchHistory: [], gameMode: "双人本", hasProfile: true,
    }))
    mocks.buildRoundCandidates.mockResolvedValue({ candidates })
    mocks.fetchPairRelations.mockResolvedValue(new Map())

    await expect(manualPair(sessionId, memberIds, reason)).resolves.toEqual({ success: true })
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ member_a_id: memberIds[0], member_b_id: memberIds[1], status: "draft" }))
    expect(mocks.syncSessionSummary).toHaveBeenCalledWith(db, sessionId, reason)
  })
})
