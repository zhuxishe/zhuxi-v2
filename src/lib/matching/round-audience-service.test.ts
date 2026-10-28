import { beforeEach, describe, expect, it, vi } from "vitest"
import type { RoundAudienceSaveInput, RoundAudienceSnapshot } from "./round-audience-types"

const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn(), serviceClient: vi.fn(), revalidate: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.serviceClient }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
import { fetchRoundAudience, saveRoundAudienceConfiguration } from "./round-audience-service"

const id = (number: number) => `00000000-0000-4000-8000-${number.toString().padStart(12, "0")}`
const roundId = id(100), actorId = id(101), operationId = id(102)
const input = (): RoundAudienceSaveInput => ({ roundId, operationId, enabled: true, memberIds: [id(2), id(1)], expectedRevision: "revision-before", reason: "  扩大本期测试参与范围  " })
const snapshot = (): RoundAudienceSnapshot => ({
  roundId, roundName: "本期测试", isTest: true, purpose: "matching", status: "open", canManage: true, enabled: false, revision: "revision-before",
  members: [
    { id: id(1), name: "已在名单", memberNumber: "ZXS_001", isTest: false, listed: true, participated: true, eligible: true },
    { id: id(2), name: "可新增成员", memberNumber: "ZXS_002", isTest: false, listed: false, participated: false, eligible: true },
    { id: id(3), name: "已有历史成员", memberNumber: null, isTest: false, listed: false, participated: true, eligible: false },
  ],
  counts: { listed: 1, effective: 1, formal: 1, test: 0 },
  operations: [{ operationId: id(99), createdAt: "2026-10-29T00:00:00Z", actorName: "管理员", enabled: false, listedCount: 1 }],
})
function saved(overrides: Record<string, unknown> = {}) {
  const payload = input()
  return { operationId, roundId, revision: "revision-after", enabled: true, listedCount: 2, alreadyApplied: false,
    expectedRevision: payload.expectedRevision, memberIds: [...payload.memberIds].sort(), reason: payload.reason.trim(), actorAdminId: actorId, ...overrides }
}
function setup() {
  const read = vi.fn().mockResolvedValue({ data: snapshot(), error: null })
  const receipt = vi.fn().mockResolvedValue({ data: null, error: null })
  const save = vi.fn().mockResolvedValue({ data: saved(), error: null })
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "admin_get_round_audience") return read(args)
    if (name === "admin_get_round_audience_operation") return receipt(args)
    if (name === "admin_save_round_audience") return save(args)
    throw new Error(`Unexpected RPC ${name}`)
  })
  mocks.client.mockResolvedValue({ rpc })
  return { read, receipt, save, rpc }
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.admin.mockResolvedValue({ id: actorId, role: "super_admin" })
  mocks.serviceClient.mockImplementation(() => { throw new Error("Service role must never be used for audience actions") })
})

describe("round audience authenticated reads", () => {
  it("reads through the session client and projects only the metadata contract", async () => {
    const f = setup()
    const data = snapshot()
    Object.assign(data, { rawSource: "PRIVATE_SOURCE", actorEmail: "PRIVATE_EMAIL" })
    Object.assign(data.members[0], { answers: "PRIVATE_ANSWERS", email: "PRIVATE_CONTACT" })
    Object.assign(data.operations[0], { reason: "PRIVATE_REASON", memberIds: ["PRIVATE_IDS"] })
    f.read.mockResolvedValue({ data, error: null })
    expect(await fetchRoundAudience(roundId)).toEqual(snapshot())
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith("admin_get_round_audience", { p_round_id: roundId })
    expect(mocks.admin).toHaveBeenCalledOnce()
    expect(mocks.client).toHaveBeenCalledOnce()
    expect(mocks.serviceClient).not.toHaveBeenCalled()
  })

  it("allows ordinary administrators to read but does not expose unrelated selectable candidates or editing permission", async () => {
    setup(); mocks.admin.mockResolvedValue({ id: actorId, role: "admin" })
    const result = await fetchRoundAudience(roundId)
    expect(result.canManage).toBe(false)
    expect(result.members.map((member) => member.id)).toEqual([id(1), id(3)])
    expect(result.counts).toEqual(snapshot().counts)
  })

  it("keeps formal or unsupported-purpose rounds read-only regardless of an unexpected editable flag", async () => {
    const f = setup()
    f.read.mockResolvedValue({ data: { ...snapshot(), isTest: false, enabled: true, members: [], counts: { listed: 0, effective: 10, formal: 10, test: 0 } }, error: null })
    expect((await fetchRoundAudience(roundId)).canManage).toBe(false)
    f.read.mockResolvedValue({ data: { ...snapshot(), purpose: "announcement" }, error: null })
    expect((await fetchRoundAudience(roundId)).canManage).toBe(false)
  })

  it.each([
    null,
    { ...snapshot(), roundId: id(500) },
    { ...snapshot(), revision: "" },
    { ...snapshot(), enabled: undefined },
    { ...snapshot(), members: [...snapshot().members, snapshot().members[0]] },
    { ...snapshot(), counts: { listed: 3, effective: 1, formal: 1, test: 0 } },
    { ...snapshot(), counts: { listed: 1, effective: 2, formal: 1, test: 0 } },
    { ...snapshot(), operations: [{ ...snapshot().operations[0], createdAt: "not-a-date" }] },
  ])("does not silently turn malformed or incomplete snapshots into an empty/default audience", async (data) => {
    const f = setup(); f.read.mockResolvedValue({ data, error: null })
    await expect(fetchRoundAudience(roundId)).rejects.toThrow("无法读取完整参与范围")
  })

  it("rejects invalid round IDs before a data read, and propagates a real load failure rather than showing empty", async () => {
    const f = setup()
    await expect(fetchRoundAudience("bad-id")).rejects.toThrow("无法读取完整参与范围")
    expect(f.rpc).not.toHaveBeenCalled()
    f.read.mockResolvedValue({ data: null, error: { code: "503", message: "PRIVATE_ERROR" } })
    await expect(fetchRoundAudience(roundId)).rejects.toThrow("暂时无法处理参与范围")
  })
})

describe("round audience writes and recovery", () => {
  it("submits a canonical list and reason with the original CAS version, using no supplied actor identity", async () => {
    const f = setup(), payload = input()
    const result = await saveRoundAudienceConfiguration(Object.assign(payload, { actorAdminId: id(999) }))
    expect(result).toEqual({ success: true, operationId, revision: "revision-after" })
    expect(f.save).toHaveBeenCalledExactlyOnceWith({ p_round_id: roundId, p_enabled: true, p_member_ids: [id(1), id(2)],
      p_expected_revision: "revision-before", p_operation_id: operationId, p_reason: "扩大本期测试参与范围" })
    expect(payload.memberIds).toEqual([id(2), id(1)])
    expect(mocks.serviceClient).not.toHaveBeenCalled()
    expect(mocks.revalidate.mock.calls.map(([path]) => path)).toEqual([
      "/admin/matching", `/admin/matching/rounds/${roundId}`, `/admin/matching/rounds/${roundId}/edit`, "/app/matching", "/app/matching/survey", "/app/matches",
    ])
  })

  it("denies a new ordinary-admin write after checking only its own possible receipt", async () => {
    const f = setup(); mocks.admin.mockResolvedValue({ id: actorId, role: "admin" })
    expect(await saveRoundAudienceConfiguration(input())).toMatchObject({ error: "仅超级管理员可以修改参与范围。" })
    expect(f.receipt).toHaveBeenCalledOnce()
    expect(f.save).not.toHaveBeenCalled()
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it("recovers an already committed own request after the caller loses super-admin permission", async () => {
    const f = setup(); mocks.admin.mockResolvedValue({ id: actorId, role: "admin" })
    f.receipt.mockResolvedValue({ data: saved({ alreadyApplied: true }), error: null })
    expect(await saveRoundAudienceConfiguration(input())).toMatchObject({ success: true, operationId })
    expect(f.save).not.toHaveBeenCalled()
  })

  it.each([
    { roundId: "invalid" }, { operationId: "invalid" }, { enabled: "true" }, { expectedRevision: "" },
    { memberIds: [id(1), id(1)] }, { memberIds: [id(1), null] }, { memberIds: "not-a-list" },
    { memberIds: Array.from({ length: 5001 }, (_, index) => id(index)) },
    { reason: null }, { reason: "短" }, { reason: "理".repeat(501) },
  ].map((changes, index) => [index, changes] as const))("rejects malformed input before touching RPCs (case %i)", async (_index, changes) => {
    const f = setup()
    expect(await saveRoundAudienceConfiguration({ ...input(), ...changes } as RoundAudienceSaveInput)).toMatchObject({ error: expect.stringContaining("核对") })
    expect(f.rpc).not.toHaveBeenCalled()
  })

  it("counts Unicode reasons by characters rather than UTF-16 units", async () => {
    const f = setup(), payload = { ...input(), reason: "😀😀😀😀" }
    f.save.mockResolvedValue({ data: saved({ reason: payload.reason }), error: null })
    expect(await saveRoundAudienceConfiguration(payload)).toMatchObject({ success: true })
    expect(f.save.mock.calls[0][0].p_reason).toBe(payload.reason)
  })

  it("resolves a prior successful receipt before performing any new write", async () => {
    const f = setup(); f.receipt.mockResolvedValue({ data: saved({ alreadyApplied: true }), error: null })
    expect(await saveRoundAudienceConfiguration(input())).toMatchObject({ success: true, operationId })
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["admin_get_round_audience_operation"])
  })

  it.each([
    { roundId: id(200) }, { operationId: id(201) }, { actorAdminId: id(202) }, { enabled: false },
    { expectedRevision: "another-revision" }, { reason: "另一个操作理由" }, { memberIds: [id(1), id(3)] },
  ])("never accepts a receipt for another actor or payload: %j", async (changes) => {
    const f = setup(); f.receipt.mockResolvedValue({ data: saved(changes), error: null })
    expect(await saveRoundAudienceConfiguration(input())).toMatchObject({ error: expect.stringContaining("操作编号已用于其他调整") })
    expect(f.save).not.toHaveBeenCalled()
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it("does not write when the initial receipt check is unavailable", async () => {
    const f = setup(); f.receipt.mockRejectedValue(new Error("network"))
    expect(await saveRoundAudienceConfiguration(input())).toMatchObject({ unknown: true, operationId })
    expect(f.save).not.toHaveBeenCalled()
  })

  it("keeps a malformed receipt uncertain instead of starting another save", async () => {
    const f = setup(); f.receipt.mockResolvedValue({ data: { ...saved(), memberIds: undefined }, error: null })
    expect(await saveRoundAudienceConfiguration(input())).toMatchObject({ unknown: true, operationId })
    expect(f.save).not.toHaveBeenCalled()
  })

  it("recovers a lost save response using the exact committed receipt", async () => {
    const f = setup(); f.save.mockRejectedValue(new Error("network"))
    f.receipt.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: saved(), error: null })
    expect(await saveRoundAudienceConfiguration(input())).toMatchObject({ success: true, operationId })
    expect(f.save).toHaveBeenCalledOnce()
    expect(f.receipt).toHaveBeenCalledTimes(2)
  })

  it("retains an unknown outcome for an identical later retry and resolves it without duplicate mutation", async () => {
    const f = setup(); f.save.mockResolvedValue({ data: null, error: { code: "503", message: "gateway unavailable" } })
    expect(await saveRoundAudienceConfiguration(input())).toMatchObject({ unknown: true, operationId })
    f.receipt.mockResolvedValue({ data: saved({ alreadyApplied: true }), error: null })
    expect(await saveRoundAudienceConfiguration(input())).toMatchObject({ success: true, operationId })
    expect(f.save).toHaveBeenCalledOnce()
  })

  it.each([
    ["ROUND_AUDIENCE_STALE", "已变化"], ["ROUND_AUDIENCE_BUSY", "正在执行其他操作"],
    ["ROUND_AUDIENCE_PARTICIPANTS_REQUIRED", "参与记录"], ["ROUND_AUDIENCE_INELIGIBLE", "不符合参与条件"],
    ["ROUND_AUDIENCE_READ_ONLY", "不可在这里修改"], ["ROUND_AUDIENCE_NOT_FOUND", "已删除或不存在"],
    ["ROUND_AUDIENCE_FORBIDDEN", "仅超级管理员"], ["ROUND_AUDIENCE_INPUT_INVALID", "无效"],
  ])("shows a bounded explanation for a definitive database rejection: %s", async (message, expected) => {
    const f = setup(); f.save.mockResolvedValue({ data: null, error: { code: "PT409", message } })
    const result = await saveRoundAudienceConfiguration(input())
    expect(result.error).toContain(expected)
    expect(result.unknown).not.toBe(true)
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it("does not mask a current authentication failure", async () => {
    const f = setup(); mocks.admin.mockRejectedValue(new Error("NEXT_REDIRECT"))
    await expect(saveRoundAudienceConfiguration(input())).rejects.toThrow("NEXT_REDIRECT")
    expect(f.rpc).not.toHaveBeenCalled()
  })
})
