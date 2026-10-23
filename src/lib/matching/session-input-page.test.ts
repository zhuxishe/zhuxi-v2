import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ admin: vi.fn(), session: vi.fn(), from: vi.fn(), snapshot: vi.fn(), pairs: vi.fn(), pool: vi.fn(), metadata: vi.fn(), preview: vi.fn(), adjustments: vi.fn() }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.admin }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }))
vi.mock("@/lib/queries/matching", () => ({ fetchMatchSession: mocks.session, fetchPairRelationships: mocks.pairs }))
vi.mock("@/lib/queries/pool-members", () => ({ fetchPoolMembers: mocks.pool }))
vi.mock("@/lib/matching/adjustment-service", () => ({ fetchMatchingAdjustmentPreview: mocks.preview, fetchMatchingAdjustmentRecords: mocks.adjustments }))
vi.mock("./import-metadata-column", () => ({ supportsImportMetadataColumn: mocks.metadata }))
vi.mock("./input-snapshot-reader", async (original) => ({
  ...await original<typeof import("./input-snapshot-reader")>(), fetchMatchingInputSnapshot: mocks.snapshot,
}))
vi.mock("@/components/admin/AdminTopBar", () => ({ AdminTopBar: () => null }))
vi.mock("@/components/admin/MatchSessionView", () => ({ MatchSessionView: () => null }))
import MatchSessionDetailPage from "@/app/admin/matching/[id]/page"
import type { MatchingInputSnapshot } from "./input-snapshot-reader"

let results: Record<string, unknown>[]
const liveRows = [
  { member_id: "a", game_type_pref: "双人", gender_pref: "男", availability: { "2026-10-26": ["上午"] },
    member: { id: "a", member_identity: { full_name: "当前-a" } } },
  { member_id: "later", game_type_pref: "都可以", gender_pref: "都可以", availability: { "2026-10-27": ["下午"] },
    member: { id: "later", member_identity: { full_name: "后来报名者" } } },
]
function snapshot(): MatchingInputSnapshot {
  return { snapshot_id: "snapshot", captured_at: "2026-10-23T01:00:00Z", status: "sealed",
    source: { submissions: [{ member_id: "a", game_type_pref: "多人", gender_pref: "女",
      availability: { "2026-10-25": ["晚上"] }, message: "PRIVATE-SNAPSHOT-NOTES",
      member: { member_identity: { full_name: "旧姓名" } } }] },
    engine_input: { candidates: [{ submissionId: "a" }] } }
}
async function pageProps() {
  const element = await MatchSessionDetailPage({ params: Promise.resolve({ id: "session" }) })
  return element.props.children[2].props
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.admin.mockResolvedValue({ id: "admin", role: "super_admin" })
  mocks.pairs.mockResolvedValue([])
  mocks.pool.mockResolvedValue([])
  mocks.adjustments.mockResolvedValue([])
  mocks.preview.mockImplementation(async (_session: string, kind: string) => ({ base_revision: "revision", submitted_count: 1, eligible_count: 1, excluded_count: 0, exclusion_summary: [], has_existing_multi_pool: false, excluded_members: [], available_members: kind === "manual" ? [{ id: "later", name: "后来报名者" }] : [] }))
  mocks.metadata.mockResolvedValue(true)
  mocks.snapshot.mockResolvedValue(snapshot())
  results = [{ id: "result", member_a_id: "a", member_b_id: "b", group_members: null, status: "draft",
    score_breakdown: { sensitive: "PRIVATE-SCORE" }, audit_reason: "PRIVATE-AUDIT",
    member_a: { id: "a", member_identity: { full_name: "当前-a" } }, member_b: { id: "b", member_identity: { full_name: "当前-b" } },
    group_member_details: null }]
  mocks.session.mockImplementation(async () => ({ session: { id: "session", round_id: "round", status: "draft", total_candidates: 1 }, results }))
  mocks.from.mockImplementation((table: string) => {
    const query: any = { select: () => query, eq: () => query, in: () => query,
      then: (resolve: (response: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve({
        data: table === "match_round_submissions" ? liveRows : [], error: null,
      }).then(resolve, reject) }
    return query
  })
})

describe("matching detail batch input projection", () => {
  it("uses the initial batch heatmap and answers while keeping later manual choices available", async () => {
    const props = await pageProps()
    expect(props.candidates).toEqual([{ preferred_time_slots: ["2026-10-25_晚上"] }])
    expect(props.submissionPrefs).toEqual({ a: { game_type_pref: "多人", gender_pref: "女", availability: { "2026-10-25": ["晚上"] }, interest_tags: undefined, social_style: undefined } })
    expect(props.allMemberOptions).toContainEqual({ id: "later", name: "后来报名者" })
    expect(props.results[0].member_a.member_identity.full_name).toBe("当前-a")
    expect(JSON.stringify(props)).not.toContain("旧姓名")
    expect(JSON.stringify(props)).not.toContain("PRIVATE-SNAPSHOT-NOTES")
    expect(props.inputSource.kind).toBe("snapshot")
  })

  it("does not give ordinary administrators raw snapshot inputs or diagnostics", async () => {
    mocks.admin.mockResolvedValue({ id: "staff", role: "admin" })
    const props = await pageProps()
    expect(props.candidates).toEqual([])
    expect(props.submissionPrefs).toEqual({})
    expect(props.results[0].score_breakdown).toBeNull()
    expect(JSON.stringify(props)).not.toMatch(/PRIVATE-|2026-10-25/)
  })

  it("shows live inputs only for saved manual additions and leaves the original heatmap unchanged", async () => {
    results.push({ ...results[0], id: "manual-result", member_a_id: "later", member_a: { id: "later", member_identity: { full_name: "后来报名者" } } })
    const props = await pageProps()
    expect(props.submissionPrefs.later.availability).toEqual({ "2026-10-27": ["下午"] })
    expect(props.candidates).toEqual([{ preferred_time_slots: ["2026-10-25_晚上"] }])
    expect(props.inputSource.manualAdjustmentCount).toBe(1)
  })

  it("keeps legacy fallback explicit and never rebuilds a privacy-redacted batch", async () => {
    mocks.snapshot.mockResolvedValueOnce(null)
    const legacy = await pageProps()
    expect(legacy.inputSource.kind).toBe("live")
    expect(legacy.candidates).toHaveLength(2)
    mocks.snapshot.mockResolvedValueOnce({ ...snapshot(), status: "redacted" })
    const redacted = await pageProps()
    expect(redacted.inputSource.kind).toBe("redacted")
    expect(redacted.submissionPrefs).toEqual({})
    expect(redacted.candidates).toEqual([])
  })
})
