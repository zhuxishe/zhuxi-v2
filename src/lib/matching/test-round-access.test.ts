import { createClient } from "@supabase/supabase-js"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ client: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }))
import { filterAccessibleMatchingResults } from "./test-round-access"

const formal = { id: "formal", session: { round: { id: "round-real", is_test: false } } }
const test = { id: "test", session: { round: { id: "round-test", is_test: true } } }
let response: unknown
let failure: boolean
let requests: URL[]

beforeEach(() => {
  vi.resetAllMocks(); response = ["round-test"]; failure = false; requests = []
  mocks.client.mockResolvedValue(createClient("https://test-round-access.invalid", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async input => {
      requests.push(new URL(String(input)))
      return failure ? Response.json({ code: "42501", message: "Denied" }, { status: 403 }) : Response.json(response)
    } },
  }))
})

describe("service matching reads repeat authenticated test-round authorization", () => {
  it("does not change formal or untagged legacy matches", async () => {
    const rows = [formal, { id: "legacy", session: null }]
    expect(await filterAccessibleMatchingResults(rows)).toEqual(rows)
    expect(mocks.client).not.toHaveBeenCalled()
  })

  it("uses the authenticated allowlist RPC without accepting a member or round claim", async () => {
    const blocked = { id: "blocked", session: [{ round: [{ id: "other-round", is_test: true }] }] }
    expect(await filterAccessibleMatchingResults([formal, test, blocked])).toEqual([formal, test])
    expect(requests).toHaveLength(1)
    expect(requests[0].pathname).toBe("/rest/v1/rpc/get_my_test_round_ids")
    expect(requests[0].search).toBe("")
  })

  it("hides test matches after allowlist removal and when the parent identity is absent", async () => {
    response = []
    expect(await filterAccessibleMatchingResults([formal, test])).toEqual([formal])
    response = ["round-test"]
    expect(await filterAccessibleMatchingResults([{ id: "missing-round-id", session: { round: { is_test: true } } }])).toEqual([])
  })

  it("fails closed instead of exposing test matches when permission lookup fails", async () => {
    failure = true
    await expect(filterAccessibleMatchingResults([test])).rejects.toThrow("Unable to verify")
    failure = false; response = { ids: ["round-test"] }
    await expect(filterAccessibleMatchingResults([test])).rejects.toThrow("Unable to verify")
  })
})
