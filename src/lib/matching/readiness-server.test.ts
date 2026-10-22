import { beforeEach, describe, expect, it, vi } from "vitest"
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }))
import { fetchMemberMatchingReadiness, fetchMyMatchingReadiness } from "./readiness-server"
import { parseMatchingReadiness } from "./profile-readiness"
const ready = { supplementary: true, personality: true, quiz: true, missing: [] }
describe("matching readiness response contract", () => {
  beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: ready, error: null }) })
  it("reads the authenticated player's status without accepting another member ID", async () => {
    expect(await fetchMyMatchingReadiness()).toEqual(ready)
    expect(rpc).toHaveBeenCalledWith("get_my_matching_readiness", undefined)
  })
  it("uses the separately authorized admin RPC for another member", async () => {
    await fetchMemberMatchingReadiness("member")
    expect(rpc).toHaveBeenCalledWith("get_member_matching_readiness", { p_member_id: "member" })
  })
  it("does not cache status between questionnaire saves", async () => {
    rpc.mockResolvedValueOnce({ data: { ...ready, quiz: false, missing: ["quiz"] } })
    expect((await fetchMyMatchingReadiness()).missing).toEqual(["quiz"])
    expect((await fetchMyMatchingReadiness()).missing).toEqual([])
  })
  it("fails closed on missing migration, permission, and network failures", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } })
    await expect(fetchMyMatchingReadiness()).rejects.toThrow("Unable to check")
    rpc.mockRejectedValue(new Error("offline"))
    await expect(fetchMyMatchingReadiness()).rejects.toThrow("offline")
  })
  it.each([null, {}, { ...ready, missing: ["quiz"] }, { ...ready, quiz: null }, { ...ready, quiz: false },
    { ...ready, quiz: false, missing: ["quiz", "quiz"] }, { supplementary: false, personality: false, quiz: true, missing: ["personality", "supplementary"] }])(
    "rejects malformed or inconsistent completion instead of granting access: %j", (value) => {
      expect(() => parseMatchingReadiness(value)).toThrow()
    })
})
