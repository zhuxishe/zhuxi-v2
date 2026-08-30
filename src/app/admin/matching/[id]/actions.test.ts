import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
  syncSessionSummary: vi.fn(),
}))

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }))
vi.mock("@/lib/matching/session-summary-sync", () => ({
  syncSessionSummary: mocks.syncSessionSummary,
}))

import { confirmSession, deleteSession, unpublishSession } from "./actions"

type DbError = { message: string } | null
type UpdateResponse = {
  data: Array<{ id: string }> | null
  error: DbError
}

function queryChain(response: UpdateResponse) {
  const chain: {
    eq: ReturnType<typeof vi.fn>
    in: ReturnType<typeof vi.fn>
    select: ReturnType<typeof vi.fn>
    then: Promise<UpdateResponse>["then"]
  } = {
    eq: vi.fn(),
    in: vi.fn(),
    select: vi.fn(),
    then: Promise.resolve(response).then.bind(Promise.resolve(response)),
  }
  chain.eq.mockReturnValue(chain)
  chain.in.mockReturnValue(chain)
  chain.select.mockResolvedValue(response)
  return chain
}

function createDb(options: {
  sessionStatus: "draft" | "confirmed"
  sessionUpdates?: UpdateResponse[]
  resultUpdate?: UpdateResponse
  roundUpdate?: UpdateResponse
}) {
  const sessionUpdateResponses = [...(options.sessionUpdates ?? [])]
  const sessionUpdate = vi.fn(() => {
    const response = sessionUpdateResponses.shift()
    if (!response) throw new Error("Unexpected match_sessions update")
    return queryChain(response)
  })
  const resultUpdate = vi.fn(() => queryChain(options.resultUpdate ?? {
    data: null,
    error: null,
  }))
  const roundUpdate = vi.fn(() => queryChain(options.roundUpdate ?? {
    data: null,
    error: null,
  }))
  const sessionSingle = vi.fn().mockResolvedValue({
    data: { status: options.sessionStatus, round_id: "round-id" },
    error: null,
  })
  const from = vi.fn((table: string) => {
    if (table === "match_sessions") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ single: sessionSingle })),
        })),
        update: sessionUpdate,
      }
    }
    if (table === "match_results") return { update: resultUpdate }
    if (table === "match_rounds") return { update: roundUpdate }
    throw new Error(`Unexpected table: ${table}`)
  })
  const rpc = vi.fn().mockResolvedValue({ data: { deleted: true }, error: null })

  return {
    db: { from, rpc },
    rpc,
    sessionUpdate,
    resultUpdate,
    roundUpdate,
  }
}

const reason = "管理员核对后调整匹配会话状态"

describe("matching session compensation consistency", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ id: "admin-id", role: "super_admin" })
  })

  it("reports partial failure when a deleted session's round cannot be reset", async () => {
    const { db, rpc, roundUpdate } = createDb({
      sessionStatus: "draft",
      roundUpdate: { data: null, error: { message: "round reset failed" } },
    })
    mocks.createClient.mockResolvedValue(db)

    await expect(deleteSession("session-id", reason)).resolves.toEqual({
      error: "会话已删除，但轮次状态重置失败，请人工检查该轮次状态",
    })

    expect(rpc).toHaveBeenCalledWith("admin_delete_operational_record", {
      p_entity: "match_sessions",
      p_id: "session-id",
      p_reason: reason,
    })
    expect(roundUpdate).toHaveBeenCalledWith({ status: "closed" })
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/matching/rounds/round-id")
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/matching")
  })

  it("does not claim confirm rollback when the compensation update errors", async () => {
    const { db, sessionUpdate } = createDb({
      sessionStatus: "draft",
      sessionUpdates: [
        { data: [{ id: "session-id" }], error: null },
        { data: null, error: { message: "rollback failed" } },
      ],
      resultUpdate: { data: null, error: { message: "result update failed" } },
    })
    mocks.createClient.mockResolvedValue(db)

    await expect(confirmSession("session-id", reason)).resolves.toEqual({
      error: "确认配对失败，且会话状态回滚失败；数据可能不一致，请人工检查",
    })
    expect(sessionUpdate).toHaveBeenNthCalledWith(2, {
      status: "draft",
      audit_reason: `失败补偿：${reason}`,
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it("treats a zero-row confirm compensation as an unknown state requiring review", async () => {
    const { db } = createDb({
      sessionStatus: "draft",
      sessionUpdates: [
        { data: [{ id: "session-id" }], error: null },
        { data: [], error: null },
      ],
      resultUpdate: { data: null, error: { message: "result update failed" } },
    })
    mocks.createClient.mockResolvedValue(db)

    await expect(confirmSession("session-id", reason)).resolves.toEqual({
      error: "确认配对失败，且会话状态回滚失败；数据可能不一致，请人工检查",
    })
  })

  it("keeps the existing rolled-back response only after a confirmed compensation write", async () => {
    const { db } = createDb({
      sessionStatus: "draft",
      sessionUpdates: [
        { data: [{ id: "session-id" }], error: null },
        { data: [{ id: "session-id" }], error: null },
      ],
      resultUpdate: { data: null, error: { message: "result update failed" } },
    })
    mocks.createClient.mockResolvedValue(db)

    await expect(confirmSession("session-id", reason)).resolves.toEqual({
      error: "操作失败，会话状态已回滚",
    })
  })

  it("does not claim unpublish rollback when restoring confirmed status fails", async () => {
    const { db, sessionUpdate } = createDb({
      sessionStatus: "confirmed",
      sessionUpdates: [
        { data: [{ id: "session-id" }], error: null },
        { data: null, error: { message: "rollback failed" } },
      ],
      resultUpdate: { data: null, error: { message: "result update failed" } },
    })
    mocks.createClient.mockResolvedValue(db)

    await expect(unpublishSession("session-id", reason)).resolves.toEqual({
      error: "撤回发布失败，且会话状态回滚失败；数据可能不一致，请人工检查",
    })
    expect(sessionUpdate).toHaveBeenNthCalledWith(2, {
      status: "confirmed",
      audit_reason: `失败补偿：${reason}`,
    })
  })
})
