import { createClient as createSdkClient } from "@supabase/supabase-js"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let createObservedFetch: typeof import("./observed-fetch").createObservedSupabaseFetch
let clock = 0
let wall = Date.UTC(2026, 9, 11)
const upstream = vi.fn<typeof fetch>()
let warn: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  vi.resetModules()
  upstream.mockReset()
  clock = 0
  wall = Date.UTC(2026, 9, 11)
  vi.stubEnv("NODE_ENV", "production")
  vi.stubEnv("SUPABASE_OBSERVABILITY_ENABLED", undefined)
  vi.stubGlobal("fetch", upstream)
  vi.spyOn(performance, "now").mockImplementation(() => clock)
  vi.spyOn(Date, "now").mockImplementation(() => wall)
  warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  createObservedFetch = (await import("./observed-fetch")).createObservedSupabaseFetch
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function event(index = 0) {
  return JSON.parse(warn.mock.calls[index][0] as string)
}

describe("passive server fetch observation", () => {
  it.each(["string", "URL", "Request"])("passes %s input and all init fields by identity without reading bodies", async (kind) => {
    const url = "https://example.supabase.co/rest/v1/members?email=private@example.com"
    const body = new ReadableStream<Uint8Array>()
    const response = new Response(new ReadableStream<Uint8Array>())
    const clone = vi.spyOn(response, "clone")
    const text = vi.spyOn(response, "text")
    const json = vi.spyOn(response, "json")
    const controller = new AbortController()
    const input = kind === "string" ? url : kind === "URL" ? new URL(url) : new Request(url)
    const init = {
      method: "POST", body, duplex: "half", signal: controller.signal,
      headers: new Headers({ Authorization: "Bearer private-token" }),
      cache: "force-cache" as const, credentials: "include" as const, redirect: "manual" as const,
      next: { revalidate: 60, tags: ["private-tag"] },
    }
    upstream.mockResolvedValue(response)

    expect(await createObservedFetch("server")(input, init)).toBe(response)
    expect(upstream).toHaveBeenCalledExactlyOnceWith(input, init)
    expect(upstream.mock.calls[0][0]).toBe(input)
    expect(upstream.mock.calls[0][1]).toBe(init)
    expect(response.bodyUsed).toBe(false)
    expect(body.locked).toBe(false)
    expect(controller.signal.aborted).toBe(false)
    expect(clone).not.toHaveBeenCalled()
    expect(text).not.toHaveBeenCalled()
    expect(json).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it("reports only headers time, while the response body can remain pending", async () => {
    const response = new Response(new ReadableStream<Uint8Array>())
    upstream.mockImplementation(async () => { clock = 2_001; return response })
    expect(await createObservedFetch("server")("https://example.supabase.co/auth/v1/user")).toBe(response)
    expect(event()).toMatchObject({
      event: "supabase_request_observation", source: "server", service: "auth", operation: "user",
      method: "GET", reason: "slow", status: 200, duration_ms: 2_001, timing: "response_headers",
      started_at: "2026-10-11T00:00:00.000Z", timestamp: "2026-10-11T00:00:00.000Z",
    })
    expect(response.bodyUsed).toBe(false)
  })

  it.each([500, 503, 504, 429])("returns HTTP %i unchanged, without decoding an error body", async (status) => {
    const response = new Response("private failure details", { status })
    upstream.mockResolvedValue(response)
    expect(await createObservedFetch("admin")("https://example.supabase.co/rest/v1/rpc/ensure_my_member_record", { method: "POST" })).toBe(response)
    expect(event()).toMatchObject({ reason: "http_error", status, operation: "ensure_my_member_record", method: "POST" })
    expect(response.bodyUsed).toBe(false)
    expect(upstream).toHaveBeenCalledOnce()
  })

  it.each([new DOMException("private-token", "AbortError"), new Error("https://host/token?secret=private-token"), { cause: "private payload" }, "private thrown value"])("rethrows the exact rejection without retry or error text", async (failure) => {
    upstream.mockRejectedValue(failure)
    await expect(createObservedFetch("proxy")("https://example.supabase.co/auth/v1/token?secret=private-token")).rejects.toBe(failure)
    expect(event()).toMatchObject({ reason: "network_error", status: null, operation: "token" })
    expect(JSON.stringify(warn.mock.calls)).not.toContain("private")
    expect(upstream).toHaveBeenCalledOnce()
  })

  it.each([
    ["/storage/v1/object/sign/bucket/private-user/photo.jpg?token=private-token", "storage", "other"],
    ["/auth/v1/admin/users/private-user?email=private@example.com", "auth", "other"],
    ["/rest/v1/rpc/private-user-operation?token=private-token", "rest", "other"],
    ["/private-user?token=private-token", "other", "other"],
  ])("logs fixed categories for sensitive paths: %s", async (path, service, operation) => {
    upstream.mockResolvedValue(new Response("private body", {
      status: 500, headers: { "sb-request-id": "private-token", "set-cookie": "private-cookie" },
    }))
    await createObservedFetch("callback")(`https://private-host.example${path}`, {
      method: "private-method", body: "private payload", headers: { Authorization: "private-header" },
    })
    expect(event()).toMatchObject({ service, operation, method: "other" })
    expect(JSON.stringify(warn.mock.calls)).not.toContain("private")
    expect(event()).not.toHaveProperty("supabase_request_id")
  })

  it("allows only a UUID platform request ID from the response", async () => {
    const id = "01a125b7-579a-7d00-93da-2237b1b31cd5"
    upstream.mockResolvedValue(new Response(null, { status: 503, headers: { "sb-request-id": id } }))
    await createObservedFetch("server")("https://example.supabase.co/rest/v1/members")
    expect(event().supabase_request_id).toBe(id)
  })

  it("resolves the current fetch at call time instead of capturing an earlier implementation", async () => {
    const observed = createObservedFetch("server")
    const later = vi.fn<typeof fetch>().mockResolvedValue(new Response())
    vi.stubGlobal("fetch", later)
    await observed("https://example.supabase.co/auth/v1/user")
    expect(later).toHaveBeenCalledOnce()
    expect(upstream).not.toHaveBeenCalled()
  })

  it("keeps results and rejections when the logger or clocks throw", async () => {
    const response = new Response(null, { status: 500 })
    const failure = new Error("original")
    warn.mockImplementation(() => { throw new Error("logger failure") })
    upstream.mockResolvedValueOnce(response).mockRejectedValueOnce(failure)
    const observed = createObservedFetch("server")
    expect(await observed("https://example.supabase.co/auth/v1/user")).toBe(response)
    await expect(observed("https://example.supabase.co/auth/v1/user")).rejects.toBe(failure)
    vi.spyOn(Date, "now").mockImplementation(() => { throw new Error("clock failure") })
    upstream.mockResolvedValueOnce(response).mockRejectedValueOnce(failure)
    expect(await observed("https://example.supabase.co/auth/v1/user")).toBe(response)
    await expect(observed("https://example.supabase.co/auth/v1/user")).rejects.toBe(failure)
    expect(upstream).toHaveBeenCalledTimes(4)
  })

  it("keeps business results when URL classification fails", async () => {
    const response = new Response(null, { status: 500 })
    upstream.mockResolvedValue(response)
    expect(await createObservedFetch("server")("not a valid URL")).toBe(response)
    expect(warn).not.toHaveBeenCalled()
  })

  it("shares bounded budgets across clients and reserves failure logs from slow successes", async () => {
    const response = new Response()
    upstream.mockImplementation(async () => { clock += 2_001; return response })
    for (let i = 0; i < 8; i++) await createObservedFetch("server")("https://example.supabase.co/auth/v1/user")
    expect(warn).toHaveBeenCalledTimes(5)
    upstream.mockResolvedValue(new Response(null, { status: 503 }))
    for (let i = 0; i < 23; i++) await createObservedFetch("admin")("https://example.supabase.co/rest/v1/members")
    expect(warn).toHaveBeenCalledTimes(25)
    expect(event(5)).toMatchObject({ suppressed_slow: 3, suppressed_failures: 0, reason: "http_error" })
    wall += 60_000
    await createObservedFetch("callback")("https://example.supabase.co/auth/v1/token")
    expect(warn).toHaveBeenCalledTimes(26)
    expect(event(25)).toMatchObject({ suppressed_failures: 3, suppressed_slow: 0 })
  })

  it.each(["development", "test"])("is silent by default in %s and supports an explicit opt-in", async (environment) => {
    vi.stubEnv("NODE_ENV", environment)
    upstream.mockResolvedValue(new Response(null, { status: 500 }))
    await createObservedFetch("server")("https://example.supabase.co/auth/v1/user")
    expect(warn).not.toHaveBeenCalled()
    vi.stubEnv("SUPABASE_OBSERVABILITY_ENABLED", "1")
    await createObservedFetch("server")("https://example.supabase.co/auth/v1/user")
    expect(warn).toHaveBeenCalledOnce()
  })

  it("does no observation work when disabled, including preserving the underlying promise", () => {
    vi.stubEnv("SUPABASE_OBSERVABILITY_ENABLED", "0")
    const pending = Promise.resolve(new Response(null, { status: 500 }))
    upstream.mockReturnValue(pending)
    vi.spyOn(performance, "now").mockImplementation(() => { throw new Error("should not read clock") })
    expect(createObservedFetch("server")("https://example.supabase.co/auth/v1/user")).toBe(pending)
    expect(warn).not.toHaveBeenCalled()
  })

  it("preserves the real SDK GET retry behavior and does not add POST retries", async () => {
    const observed = createObservedFetch("server")
    const client = createSdkClient("https://example.supabase.co", "public-test-key", {
      accessToken: async () => "test-token", global: { fetch: observed },
    })
    upstream.mockResolvedValueOnce(new Response("unavailable", { status: 503, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(Response.json([]))
    expect((await client.from("members").select("id")).error).toBeNull()
    expect(upstream).toHaveBeenCalledTimes(2)
    expect(new Headers(upstream.mock.calls[1][1]?.headers).get("x-retry-count")).toBe("1")
    upstream.mockReset().mockResolvedValue(Response.json({ code: "PGRST003", message: "unavailable" }, { status: 503 }))
    expect((await client.rpc("ensure_my_member_record")).error?.code).toBe("PGRST003")
    expect(upstream).toHaveBeenCalledOnce()
  })
})
