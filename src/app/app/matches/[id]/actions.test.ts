import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), player: vi.fn(), revalidate: vi.fn() }))
vi.mock("@/lib/auth/player", () => ({ requirePlayer: mocks.player }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
import { requestCancellation } from "./actions"

function form(version = "2") {
  const input = new FormData()
  input.set("matchId", "result"); input.set("reason", "我的取消原因"); input.set("publicationVersion", version)
  return input
}
beforeEach(() => { vi.resetAllMocks(); mocks.player.mockResolvedValue({ memberId: "me" }); mocks.rpc.mockResolvedValue({ error: null }) })
describe("published match cancellation", () => {
  it("passes the displayed publication version to the atomic RPC without changing the reason", async () => {
    expect(await requestCancellation(form())).toEqual({ success: true })
    expect(mocks.rpc).toHaveBeenCalledWith("request_my_match_cancellation", { p_result_id: "result", p_reason: "我的取消原因", p_expected_publication_version: 2 })
    expect(mocks.player).toHaveBeenCalledOnce()
  })
  it.each(["", "0", "-1", "2.5", "NaN"])("does not send an invalid version %s", async (version) => {
    expect(await requestCancellation(form(version))).toEqual({ error: "publicationChanged" })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it.each(["MATCH_PUBLICATION_STALE", "MATCH_NOT_PUBLISHED"])("returns a recoverable error for %s without revalidation", async (message) => {
    mocks.rpc.mockResolvedValue({ error: { message } })
    expect(await requestCancellation(form())).toEqual({ error: "publicationChanged" })
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
})
