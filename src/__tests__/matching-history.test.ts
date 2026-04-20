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
      data: [
        {
          id: "result-1",
          member_a_id: "11111111-1111-1111-1111-111111111111",
          member_b_id: "22222222-2222-2222-2222-222222222222",
          group_members: null,
        },
        {
          id: "result-2",
          member_a_id: "11111111-1111-1111-1111-111111111111",
          member_b_id: null,
          group_members: [
            "11111111-1111-1111-1111-111111111111",
            "22222222-2222-2222-2222-222222222222",
            "33333333-3333-3333-3333-333333333333",
          ],
        },
        {
          id: "result-2",
          member_a_id: "11111111-1111-1111-1111-111111111111",
          member_b_id: null,
          group_members: [
            "11111111-1111-1111-1111-111111111111",
            "22222222-2222-2222-2222-222222222222",
            "33333333-3333-3333-3333-333333333333",
          ],
        },
      ],
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
    expect(or).toHaveBeenCalledWith(
      `member_a_id.in.(${memberIds.join(",")}),member_b_id.in.(${memberIds.join(",")}),group_members.cs.{${memberIds[0]}},group_members.cs.{${memberIds[1]}}`,
    )
    expect(result.get(memberIds[0])).toEqual([
      { name: memberIds[1], count: 2 },
      { name: "33333333-3333-3333-3333-333333333333", count: 1 },
    ])
    expect(result.get(memberIds[1])).toEqual([
      { name: memberIds[0], count: 2 },
      { name: "33333333-3333-3333-3333-333333333333", count: 1 },
    ])
  })
})
