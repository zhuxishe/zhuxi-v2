import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), createClient: vi.fn(), revalidatePath: vi.fn(), syncSessionSummary: vi.fn(), performAdjustment: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }))
vi.mock("@/lib/matching/session-summary-sync", () => ({ syncSessionSummary: mocks.syncSessionSummary }))
vi.mock("@/lib/matching/adjustment-service", () => ({ performMatchingAdjustment: mocks.performAdjustment }))

import { confirmSession, deleteSession, lockPair, restorePair, splitPair, unlockPair, unpublishSession } from "./actions"
import type { MatchMemberResult } from "@/lib/matching/member-conflicts"

type DbError = { code?: string; message: string } | null
const reason = "管理员核对后调整匹配会话状态"
const cancelled = { id: "cancelled-id", status: "cancelled", session_id: "session-id", member_a_id: "A", member_b_id: "B" }

function createDb(options: {
  sessionStatus?: string; roundId?: string | null; sessionError?: DbError
  rpcError?: DbError; rpcData?: unknown
  result?: typeof cancelled; activeResults?: MatchMemberResult[] | null; occupancyError?: DbError
  resultUpdate?: { data: { id: string } | null; error: DbError }
} = {}) {
  const updateChain = {
    eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn().mockResolvedValue(options.resultUpdate ?? { data: { id: cancelled.id }, error: null }),
  }
  updateChain.eq.mockReturnValue(updateChain)
  updateChain.select.mockReturnValue(updateChain)
  const resultUpdate = vi.fn(() => updateChain)
  const from = vi.fn((table: string) => {
    if (table === "match_sessions") return { select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({
      data: { status: options.sessionStatus ?? "draft", round_id: options.roundId === undefined ? "round-id" : options.roundId, publication_version: 3 },
      error: options.sessionError ?? null,
    }) })) })) }
    if (table === "match_results") {
      const response = Promise.resolve({ data: options.activeResults === undefined ? [] : options.activeResults, error: options.occupancyError ?? null })
      const chain = { eq: vi.fn(), neq: vi.fn(), single: vi.fn().mockResolvedValue({ data: options.result ?? cancelled, error: null }), then: response.then.bind(response) }
      chain.eq.mockReturnValue(chain)
      chain.neq.mockReturnValue(chain)
      return { select: vi.fn(() => chain), update: resultUpdate }
    }
    throw new Error(`Unexpected direct table mutation: ${table}`)
  })
  const rpc = vi.fn().mockResolvedValue({ data: options.rpcData ?? { published: true, round_id: "round-id" }, error: options.rpcError ?? null })
  return { db: { from, rpc }, rpc, resultUpdate, updateChain }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireAdmin.mockResolvedValue({ id: "admin-id", role: "super_admin" })
  mocks.performAdjustment.mockResolvedValue({ success: true })
})

describe("atomic matching publication actions", () => {
  it.each([
    [confirmSession, "admin_publish_match_session"],
    [unpublishSession, "admin_unpublish_match_session"],
    [deleteSession, "admin_delete_match_session_draft"],
  ] as const)("uses one audited/versioned RPC for %s", async (action, name) => {
    const { db, rpc, resultUpdate } = createDb()
    mocks.createClient.mockResolvedValue(db)
    await expect(action("session-id", reason, 3)).resolves.toEqual({ success: true })
    expect(rpc).toHaveBeenCalledExactlyOnceWith(name, { p_session_id: "session-id", p_reason: reason, p_expected_publication_version: 3 })
    expect(resultUpdate).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/matches", "layout")
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/matching/rounds/round-id")
  })

  it("sends the browser's version rather than silently substituting the current database version", async () => {
    const { db, rpc } = createDb({ rpcError: { code: "PT409", message: "MATCH_PUBLICATION_STALE" } })
    mocks.createClient.mockResolvedValue(db)
    await expect(unpublishSession("session-id", reason, 1)).resolves.toEqual({ error: "发布版本或审批状态已变化，请刷新并核对后重试；当前操作未生效" })
    expect(rpc).toHaveBeenCalledWith("admin_unpublish_match_session", expect.objectContaining({ p_expected_publication_version: 1 }))
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it("explains a duplicate member across published sessions without doing compensation writes", async () => {
    const { db, rpc, resultUpdate } = createDb({ rpcError: { code: "PT409", message: "MATCH_PUBLICATION_CONFLICT" } })
    mocks.createClient.mockResolvedValue(db)
    await expect(confirmSession("session-id", reason, 3)).resolves.toEqual({ error: "本轮有成员已在其他已发布结果中，请先撤回或调整冲突结果后再发布" })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(resultUpdate).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it("accepts an idempotent retry without sending another table write", async () => {
    const { db, rpc } = createDb({ sessionStatus: "confirmed", rpcData: { already_applied: true } })
    mocks.createClient.mockResolvedValue(db)
    await expect(confirmSession("session-id", reason, 3)).resolves.toEqual({ success: true })
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it("explains why a partially generated session cannot be published", async () => {
    const { db } = createDb({ rpcError: { code: "PT409", message: "MATCH_PUBLICATION_INCOMPLETE" } })
    mocks.createClient.mockResolvedValue(db)
    await expect(confirmSession("session-id", reason, 0)).resolves.toEqual({ error: "本次匹配尚未完整生成，请刷新并核对后再发布" })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it.each([Number.NaN, -1, 0.5])("rejects an unusable publication version %s before database work", async (version) => {
    await expect(confirmSession("session-id", reason, version)).resolves.toEqual({ error: "发布版本无效，请刷新后重试" })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it("keeps old test sessions read only through the atomic operation", async () => {
    const { db } = createDb({ rpcError: { code: "PT409", message: "MATCH_PUBLICATION_READ_ONLY" } })
    mocks.createClient.mockResolvedValue(db)
    await expect(deleteSession("session-id", reason, 3)).resolves.toEqual({ error: "旧测试匹配记录仅支持查看" })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it("keeps deleting an already deleted draft idempotent", async () => {
    const { db, rpc } = createDb({ rpcData: { deleted: true, already_applied: true } })
    mocks.createClient.mockResolvedValue(db)
    await expect(deleteSession("session-id", reason, 3)).resolves.toEqual({ success: true })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(db.from).not.toHaveBeenCalled()
  })

  it("does not reset a round from a client-side delete step", async () => {
    const { db } = createDb()
    mocks.createClient.mockResolvedValue(db)
    await expect(deleteSession("session-id", reason, 3)).resolves.toEqual({ success: true })
    expect(db.from).not.toHaveBeenCalledWith("match_rounds")
  })
})

describe("published result edits and controlled adjustment routing", () => {
  it.each([lockPair, unlockPair])("blocks direct edit %s on a published session", async (action) => {
    const { db, resultUpdate } = createDb({ sessionStatus: "confirmed" })
    mocks.createClient.mockResolvedValue(db)
    await expect(action(cancelled.id, reason)).resolves.toEqual({ error: "该匹配已发布，请先撤回发布后再调整" })
    expect(resultUpdate).not.toHaveBeenCalled()
  })

  it.each([[splitPair, "split"], [restorePair, "restore"]] as const)("routes %s through an atomic, versioned operation", async (action, kind) => {
    const { db, resultUpdate } = createDb()
    mocks.createClient.mockResolvedValue(db)
    await expect(action(cancelled.id, reason, "operation", "revision")).resolves.toEqual({ success: true })
    expect(mocks.performAdjustment).toHaveBeenCalledExactlyOnceWith({ sessionId: "session-id", kind, resultId: cancelled.id, rawReason: reason, operationId: "operation", expectedRevision: "revision" })
    expect(resultUpdate).not.toHaveBeenCalled()
    expect(mocks.syncSessionSummary).not.toHaveBeenCalled()
  })

  it("returns the atomic restore's conflict rather than editing or compensating separately", async () => {
    const { db, resultUpdate } = createDb()
    mocks.createClient.mockResolvedValue(db)
    mocks.performAdjustment.mockResolvedValue({ error: "成员已有有效配对" })
    await expect(restorePair(cancelled.id, reason, "operation")).resolves.toEqual({ error: "成员已有有效配对" })
    expect(resultUpdate).not.toHaveBeenCalled()
  })

  it("does not claim success when a draft lock lost a status race", async () => {
    const { db } = createDb({ result: { ...cancelled, status: "draft" }, resultUpdate: { data: null, error: null } })
    mocks.createClient.mockResolvedValue(db)
    await expect(lockPair(cancelled.id, reason)).resolves.toEqual({ error: "配对状态已变化，请刷新后重试" })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
