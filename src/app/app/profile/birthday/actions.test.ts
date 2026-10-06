import { beforeEach, describe, expect, it, vi } from "vitest"

const { requirePlayer, rpc, revalidatePath } = vi.hoisted(() => ({
  requirePlayer: vi.fn(), rpc: vi.fn(), revalidatePath: vi.fn(),
}))
vi.mock("@/lib/auth/player", () => ({ requirePlayer }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }))
vi.mock("next/cache", () => ({ revalidatePath }))

import { completeBirthdayAction } from "./actions"
import { fetchMyBirthdayCompletion } from "@/lib/profile/birthday-completion"

describe("birthday completion", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requirePlayer.mockResolvedValue({ memberId: "self" })
    rpc.mockResolvedValue({ data: { eligible: true, birth_date: "2000-02-29", age_range: "24-26" }, error: null })
  })

  it("saves only the birthday through the authenticated RPC and refreshes all affected views", async () => {
    await expect(completeBirthdayAction("2000-02-29")).resolves.toMatchObject({ state: { birth_date: "2000-02-29" } })
    expect(requirePlayer).toHaveBeenCalledOnce()
    expect(rpc).toHaveBeenCalledExactlyOnceWith("complete_my_birth_date", { p_birth_date: "2000-02-29" })
    expect(revalidatePath.mock.calls).toEqual([
      ["/app", "layout"], ["/app/profile"], ["/app/profile/birthday"],
      ["/admin/members"], ["/admin/members/self"],
    ])
  })

  it.each(["", "2001-02-29", "2999-01-01", "2000-2-29", "2000-02-29T00:00:00Z"])("rejects invalid birthday %s before writing", async (value) => {
    await expect(completeBirthdayAction(value)).resolves.toEqual({ error: "invalidDate" })
    expect(rpc).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("does not bypass player authentication", async () => {
    requirePlayer.mockRejectedValue(new Error("redirect"))
    await expect(completeBirthdayAction("2000-02-29")).rejects.toThrow("redirect")
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ["BIRTH_DATE_ALREADY_SET", "alreadySet"],
    ["BIRTH_DATE_NOT_ELIGIBLE", "notEligible"],
    ["BIRTH_DATE_INVALID", "invalidDate"],
    ["database unavailable", "saveFailed"],
  ])("handles %s without reporting a successful save", async (message, error) => {
    rpc.mockResolvedValue({ data: null, error: { message } })
    await expect(completeBirthdayAction("2000-02-29")).resolves.toEqual({ error })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("does not report malformed or mismatched RPC results as saved", async () => {
    for (const data of [null, {}, { eligible: true, birth_date: "1999-01-01", age_range: "24-26" }]) {
      rpc.mockResolvedValue({ data, error: null })
      await expect(completeBirthdayAction("2000-02-29")).resolves.toEqual({ error: "saveFailed" })
    }
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("reads completion eligibility without sending a member ID", async () => {
    rpc.mockResolvedValue({ data: { eligible: false, birth_date: null, age_range: null }, error: null })
    await expect(fetchMyBirthdayCompletion()).resolves.toEqual({ eligible: false, birth_date: null, age_range: null })
    expect(rpc).toHaveBeenCalledExactlyOnceWith("get_my_birthday_completion")
  })

  it("does not turn a load failure into a missing birthday invitation", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "offline" } })
    await expect(fetchMyBirthdayCompletion()).rejects.toThrow("Unable to load birthday completion")
  })
})
