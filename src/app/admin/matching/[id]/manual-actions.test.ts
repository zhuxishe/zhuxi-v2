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

import { checkGroupCompatibility, manualPair } from "./manual-actions"

const sessionId = "10000000-0000-4000-8000-000000000001"
const memberIds = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"]
const reason = "管理员核对后手动配对"
type OccupancyResponse = { data: { id: string }[] | null; error: { message: string } | null }

function candidate(id: string): MatchCandidate {
  return {
    submissionId: id, name: id, gameTypePref: "双人", genderPref: "都可以",
    availability: { "2026-10-10": ["下午"] }, formInterestTags: [], formSocialStyle: null,
    gender: "male", school: "测试大学", interestTags: [], socialTags: [], level: 1,
    compatibilityScore: 4, matchHistory: [], gameMode: "双人本", hasProfile: true,
  }
}

function createDb(responses: OccupancyResponse[], sessionStatus = "draft") {
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
        select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { round_id: "round-id", status: sessionStatus }, error: null }) })) })),
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

  it("still requires at least two members before reading or writing matching data", async () => {
    await expect(manualPair(sessionId, memberIds.slice(0, 1), reason)).resolves.toEqual({ error: "至少需要 2 人" })
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.buildRoundCandidates).not.toHaveBeenCalled()
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

  it("does not calculate or insert manual pairs into published sessions", async () => {
    const { db, insert, lookup } = createDb([], "confirmed")
    mocks.createClient.mockResolvedValue(db)
    await expect(manualPair(sessionId, memberIds, reason)).resolves.toEqual({ error: "该匹配已发布，请先撤回发布后再调整" })
    expect(lookup).not.toHaveBeenCalled()
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
    const candidates = memberIds.map(candidate)
    mocks.buildRoundCandidates.mockResolvedValue({ candidates })
    mocks.fetchPairRelations.mockResolvedValue(new Map())

    await expect(manualPair(sessionId, memberIds, reason)).resolves.toEqual({ success: true })
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ member_a_id: memberIds[0], member_b_id: memberIds[1], status: "draft" }))
    expect(mocks.syncSessionSummary).toHaveBeenCalledWith(db, sessionId, reason)
  })

  it("stores all thirteen selected members in one group and clears every member's diagnostics", async () => {
    const groupIds = Array.from({ length: 13 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`)
    const { db, insert, lookup } = createDb(Array.from({ length: groupIds.length * 2 }, () => ({ data: [], error: null })))
    mocks.createClient.mockResolvedValue(db)
    mocks.buildRoundCandidates.mockResolvedValue({ candidates: groupIds.map((id) => ({ ...candidate(id), gameTypePref: "多人" })) })
    mocks.fetchPairRelations.mockResolvedValue(new Map())

    await expect(manualPair(sessionId, groupIds, reason)).resolves.toEqual({ success: true })
    expect(lookup).toHaveBeenCalledTimes(26)
    expect(mocks.buildRoundCandidates).toHaveBeenCalledWith("round-id", groupIds)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      member_a_id: groupIds[0], member_b_id: null, group_members: groupIds,
      best_slot: "2026-10-10_下午", status: "draft",
    }))
    expect(db.rpc).toHaveBeenCalledWith("admin_clear_unmatched_diagnostics", {
      p_session_id: sessionId, p_member_ids: groupIds, p_reason: reason,
    })
    expect(mocks.syncSessionSummary).toHaveBeenCalledWith(db, sessionId, reason)
  })

  it("still rejects an occupied member after the sixth selected member", async () => {
    const groupIds = Array.from({ length: 7 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`)
    const responses: OccupancyResponse[] = Array.from({ length: 12 }, () => ({ data: [], error: null }))
    responses.push({ data: [{ id: "existing" }], error: null })
    const { db, insert, lookup } = createDb(responses)
    mocks.createClient.mockResolvedValue(db)

    await expect(manualPair(sessionId, groupIds, reason)).resolves.toEqual({ error: "成员已在此次匹配中有活跃配对，请先拆分旧配对" })
    expect(lookup).toHaveBeenCalledTimes(13)
    expect(insert).not.toHaveBeenCalled()
    expect(mocks.buildRoundCandidates).not.toHaveBeenCalled()
  })

  it("still requires a time slot shared with the thirteenth member", async () => {
    const groupIds = Array.from({ length: 13 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`)
    const { db, insert } = createDb(Array.from({ length: groupIds.length * 2 }, () => ({ data: [], error: null })))
    mocks.createClient.mockResolvedValue(db)
    const candidates = groupIds.map(candidate)
    candidates[12].availability = { "2026-10-11": ["下午"] }
    mocks.buildRoundCandidates.mockResolvedValue({ candidates })
    mocks.fetchPairRelations.mockResolvedValue(new Map())

    await expect(manualPair(sessionId, groupIds, reason)).resolves.toEqual({ error: "无共同可用时段，无法组建多人组" })
    expect(insert).not.toHaveBeenCalled()
    expect(db.rpc).not.toHaveBeenCalled()
  })
})

describe("manual group preview checks the final selected pool", () => {
  const groupIds = [...memberIds, "00000000-0000-4000-8000-000000000003"]
  const members = groupIds.map((id, index) => ({ ...candidate(id), gameTypePref: "多人" as const,
    gender: index === 2 ? "男" : "女", genderPref: index === 2 ? "都可以" as const : "男" as const }))

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ id: "admin-id", role: "super_admin" })
    mocks.createClient.mockResolvedValue(createDb([]).db)
    mocks.fetchPairRelations.mockResolvedValue(new Map())
  })

  it.each([[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]])(
    "accepts the same complete female/female/male group regardless of selection order %j",
    async (...order) => {
      const selected = order.map((index) => members[index])
      mocks.buildRoundCandidates.mockResolvedValue({ candidates: selected })
      const preview = await checkGroupCompatibility(sessionId, selected.map((member) => member.submissionId))
      expect(preview.compatible).toBe(true)
      expect(preview.warnings).toEqual([])
      expect(preview.constraints.find((item) => item.label === "性别兼容")?.status).toBe("pass")
      expect(preview.bestSlot).toBe("2026-10-10_下午")
    },
  )

  it("keeps a genuine final-pool gender conflict visible", async () => {
    mocks.buildRoundCandidates.mockResolvedValue({ candidates: members.map((member) => ({ ...member, gender: "女", genderPref: "男" })) })
    const preview = await checkGroupCompatibility(sessionId, groupIds)
    expect(preview.compatible).toBe(false)
    expect(preview.warnings.some((warning) => warning.includes("组内无人满足"))).toBe(true)
    expect(preview.constraints.find((item) => item.label === "性别兼容")?.status).toBe("fail")
  })

  it("checks relations between all final members and retains the existing common-time rule", async () => {
    mocks.buildRoundCandidates.mockResolvedValue({ candidates: [members[0], members[1], { ...members[2], availability: { "2026-10-11": ["下午"] } }] })
    mocks.fetchPairRelations.mockResolvedValue(new Map([[`${groupIds[0]}||${groupIds[1]}`, {
      playerA: groupIds[0], playerB: groupIds[1], status: "blacklist", totalPairCount: 0, hasMutualFive: false, reason: "测试冲突",
    }]]))
    const preview = await checkGroupCompatibility(sessionId, groupIds)
    expect(preview.compatible).toBe(false)
    expect(preview.warnings.some((warning) => warning.includes("黑名单"))).toBe(true)
    expect(preview.warnings).toContain("无共同可用时段")
    expect(preview.bestSlot).toBeNull()
  })

  it("preserves raw-constraint redaction for an ordinary administrator", async () => {
    mocks.requireAdmin.mockResolvedValue({ id: "admin-id", role: "admin" })
    mocks.buildRoundCandidates.mockResolvedValue({ candidates: members.map((member) => ({ ...member, gender: "女", genderPref: "男" })) })
    const preview = await checkGroupCompatibility(sessionId, groupIds)
    expect(preview.warnings).toEqual(["存在不满足的匹配约束"])
    expect(preview.constraints.every((item) => item.details.every((detail) => detail.includes("仅超级管理员")))).toBe(true)
  })
})
