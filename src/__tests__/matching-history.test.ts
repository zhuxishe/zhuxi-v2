import { beforeEach, describe, expect, it, vi } from "vitest"

const eq = vi.fn()
const or = vi.fn()
const select = vi.fn()
const from = vi.fn()
const createClient = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createClient,
}))

describe("fetchMatchHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const query = { eq, or }
    eq.mockReturnValue(query)
    or.mockResolvedValue({
      data: [{ member_a_id: "11111111-1111-1111-1111-111111111111", member_b_id: "22222222-2222-2222-2222-222222222222" }],
      error: null,
    })
    select.mockReturnValue(query)
    from.mockReturnValue({ select })
    createClient.mockResolvedValue({ from })
  })

  it("only counts confirmed results from confirmed sessions", async () => {
    const { fetchMatchHistory } = await import("@/lib/queries/match-history")
    const memberIds = [
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ]

    const result = await fetchMatchHistory(memberIds)

    expect(eq).toHaveBeenCalledWith("status", "confirmed")
    expect(eq).toHaveBeenCalledWith("session.status", "confirmed")
    expect(result.get(memberIds[0])).toEqual([{ name: memberIds[1], count: 1 }])
  })
})
