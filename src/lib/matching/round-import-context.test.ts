import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ from: vi.fn(), parse: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }))
vi.mock("./round-import-parser", () => ({ parseRoundImportWorkbook: mocks.parse }))
import { loadRoundImportContext } from "./round-import-context"

describe("round import deletion guard", () => {
  beforeEach(() => { vi.resetAllMocks() })

  it("rejects a retained deleted round before parsing Excel or accessing member data", async () => {
    const query = { select: vi.fn(), eq: vi.fn(), single: vi.fn() }
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query)
    query.single.mockResolvedValue({ data: { id: "round", purpose: "matching", status: "closed", deleted_at: "2026-10-10T00:00:00Z" }, error: null })
    mocks.from.mockReturnValue(query)
    await expect(loadRoundImportContext("round", Buffer.from("test"))).rejects.toThrow("轮次不存在")
    expect(mocks.from).toHaveBeenCalledTimes(1)
    expect(mocks.parse).not.toHaveBeenCalled()
  })
})
