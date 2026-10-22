import { describe, expect, it, vi } from "vitest"
import { syncSessionSummary } from "./session-summary-sync"
import type { SupabaseClient } from "@supabase/supabase-js"

function database(results: { status: string; member_a_id: string; member_b_id: string | null; group_members?: string[] | null }[], diagnostics: string[], diagnosticError: Error | null = null) {
  const update = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }))
  const db = { from: vi.fn((table: string) => {
    if (table === "match_sessions") return {
      select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { total_candidates: 2 }, error: null }) })) })), update,
    }
    if (table === "match_results") return { select: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: results, error: null }) })) }
    if (table === "unmatched_diagnostics") return { select: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: diagnostics.map((member_id) => ({ member_id })), error: diagnosticError }) })) }
    throw new Error(`Unexpected table ${table}`)
  }) }
  return { db: db as unknown as SupabaseClient, update }
}
const reason = "人工配对后同步本批人数"

describe("saved matching roster summary", () => {
  it("includes a late respondent added manually before publication", async () => {
    // The run originally contained A/B. After C/D submitted during collection,
    // an administrator manually paired them into the same saved draft.
    const { db, update } = database([
      { status: "draft", member_a_id: "A", member_b_id: "B" },
      { status: "draft", member_a_id: "C", member_b_id: "D" },
    ], [])
    await syncSessionSummary(db, "session", reason)
    expect(update).toHaveBeenCalledWith({ total_candidates: 4, total_matched: 4, total_unmatched: 0, audit_reason: reason })
  })

  it("counts cancelled members and saved unmatched diagnostics once in the batch roster", async () => {
    const { db, update } = database([
      { status: "cancelled", member_a_id: "A", member_b_id: "B" },
      { status: "locked", member_a_id: "C", member_b_id: null, group_members: ["C", "D", "E"] },
    ], ["A", "F"])
    await syncSessionSummary(db, "session", reason)
    expect(update).toHaveBeenCalledWith({ total_candidates: 6, total_matched: 3, total_unmatched: 3, audit_reason: reason })
  })

  it("keeps the prior statistics if a roster read fails", async () => {
    const failure = new Error("diagnostic read failed")
    const { db, update } = database([{ status: "draft", member_a_id: "A", member_b_id: "B" }], [], failure)
    await expect(syncSessionSummary(db, "session", reason)).rejects.toBe(failure)
    expect(update).not.toHaveBeenCalled()
  })
})
