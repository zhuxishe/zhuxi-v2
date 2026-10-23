import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), admin: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }))
import {
  fetchMatchingInputSnapshot, selectSessionSubmissionInputs, sessionSubmissionInputLabel,
  type MatchingInputSnapshot,
} from "./input-snapshot-reader"

function snapshot(): MatchingInputSnapshot {
  return { snapshot_id: "snapshot", captured_at: "2026-10-23T01:00:00Z", status: "sealed",
    source: { submissions: [
      { member_id: "a", gender_pref: "女", availability: { "2026-10-25": ["晚上"] } },
      { member_id: "b", game_type_pref: "多人" },
      { member_id: "ineligible", game_type_pref: "双人" },
    ] }, engine_input: { candidates: [{ submissionId: "a" }, { submissionId: "b" }] } }
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.admin.mockResolvedValue({ id: "acting-admin", role: "super_admin" })
  mocks.rpc.mockResolvedValue({ data: snapshot(), error: null })
})

describe("matching input snapshot reader", () => {
  it("checks administrator identity before using the service-only read RPC", async () => {
    expect(await fetchMatchingInputSnapshot("session")).toEqual(snapshot())
    expect(mocks.rpc).toHaveBeenCalledWith("admin_read_matching_input", {
      p_session_id: "session", p_actor_admin_id: "acting-admin",
    })
    mocks.rpc.mockClear()
    mocks.admin.mockRejectedValue(new Error("login required"))
    await expect(fetchMatchingInputSnapshot("session")).rejects.toThrow("login required")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("uses legacy fallback only for an explicit null, never for failures or malformed snapshots", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null })
    expect(await fetchMatchingInputSnapshot("old")).toBeNull()
    mocks.rpc.mockResolvedValueOnce({ data: { legacy: true, status: "legacy" }, error: null })
    expect(await fetchMatchingInputSnapshot("old-metadata")).toBeNull()
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } })
    await expect(fetchMatchingInputSnapshot("failed")).rejects.toEqual({ message: "unavailable" })
    mocks.rpc.mockResolvedValueOnce({ data: {}, error: null })
    await expect(fetchMatchingInputSnapshot("bad")).rejects.toThrow("无法读取")
    mocks.rpc.mockResolvedValueOnce({ data: { ...snapshot(), source: {} }, error: null })
    await expect(fetchMatchingInputSnapshot("incomplete")).rejects.toThrow("不完整")
  })

  it("discards all retained payload when the database marks a snapshot redacted", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ...snapshot(), status: "redacted" }, error: null })
    const result = await fetchMatchingInputSnapshot("redacted")
    expect(result?.status).toBe("redacted")
    expect(result?.source.submissions).toEqual([])
    expect(result?.engine_input.candidates).toEqual([])
  })
})

describe("batch input projections", () => {
  it("keeps the original cohort and inputs while allowing saved later manual members", () => {
    const original = snapshot()
    const live = [
      { member_id: "a", gender_pref: "男", availability: { "2026-10-26": ["上午"] } },
      { member_id: "manual", game_type_pref: "双人" },
      { member_id: "later", game_type_pref: "双人" },
    ]
    const selected = selectSessionSubmissionInputs(original, live, ["a", "manual"])
    expect(selected.initialRows.map((row) => row.member_id)).toEqual(["a", "b"])
    expect(selected.rows.map((row) => row.member_id)).toEqual(["a", "b", "manual"])
    expect(selected.rows[0]).toEqual(original.source.submissions[0])
    expect(selected.source).toMatchObject({ kind: "snapshot", capturedAt: original.captured_at, manualAdjustmentCount: 1,
      submittedCount: 3, eligibleCount: 2, excludedCount: 1 })
    expect(original.source.submissions).toHaveLength(3)
  })

  it("keeps old-session live behavior and never reconstructs redacted input", () => {
    const live = [{ member_id: "a", gender_pref: "男" }]
    expect(selectSessionSubmissionInputs(null, live, ["a"]).rows).toBe(live)
    const selected = selectSessionSubmissionInputs({ ...snapshot(), status: "redacted" }, live, ["a"])
    expect(selected.rows).toEqual([])
    expect(selected.initialRows).toEqual([])
    expect(selected.source.kind).toBe("redacted")
  })

  it("allows a previously ineligible person to be saved later by the existing manual workflow", () => {
    const selected = selectSessionSubmissionInputs(snapshot(), [{ member_id: "ineligible", game_type_pref: "都可以" }], ["ineligible"])
    expect(selected.rows.find((row) => row.member_id === "ineligible")?.game_type_pref).toBe("都可以")
    expect(selected.initialRows.some((row) => row.member_id === "ineligible")).toBe(false)
    expect(sessionSubmissionInputLabel(snapshot(), "ineligible")).toBe("后续人工调整当前资料")
  })

  it("labels original snapshots, saved manual additions, legacy fallback and privacy redaction", () => {
    expect(sessionSubmissionInputLabel(snapshot(), "a")).toBe("初始批次输入快照")
    expect(sessionSubmissionInputLabel(snapshot(), "manual")).toBe("后续人工调整当前资料")
    expect(sessionSubmissionInputLabel(null, "a")).toContain("无快照")
    expect(sessionSubmissionInputLabel({ ...snapshot(), status: "redacted" }, "a")).toContain("已脱敏")
  })

  it("summarizes eligibility without leaking member identifiers or raw reasons", () => {
    const original = snapshot()
    original.source.eligibility = [{ eligible: false, reasons: ["account_unavailable", "profile_incomplete"] },
      { eligible: true, reasons: [] }]
    const source = selectSessionSubmissionInputs(original, [], []).source
    expect(source.exclusionSummary).toEqual(["账号不可用 1 人", "必需资料不完整 1 人"])
    expect(JSON.stringify(source)).not.toContain("ineligible")
  })
})
