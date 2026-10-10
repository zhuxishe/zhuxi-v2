import type { CookieMethodsServer } from "@supabase/ssr"
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(), createBrowserClient: vi.fn(), createSdkClient: vi.fn(),
  cookies: vi.fn(), cookieGetAll: vi.fn(), cookieSet: vi.fn(),
  getClaims: vi.fn(), getUser: vi.fn(), exchangeCodeForSession: vi.fn(),
  ensure: vi.fn(), snapshot: vi.fn(),
}))
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient, createBrowserClient: mocks.createBrowserClient }))
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createSdkClient }))
vi.mock("next/headers", () => ({ cookies: mocks.cookies }))
vi.mock("@/lib/member-master/rpc", () => ({
  ensureMyMemberRecord: mocks.ensure, resolveMemberRouteSnapshot: mocks.snapshot,
  getMemberMasterDiagnostic: () => ({ operation: "ensure", code: "unknown" }),
}))
vi.mock("@/lib/auth/routing", () => ({ resolvePlayerRoute: () => ({ action: "render", view: "home" }) }))

interface ClientOptions { global: { fetch: typeof fetch }; cookies: CookieMethodsServer }

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.stubEnv("NODE_ENV", "production")
  vi.stubEnv("SUPABASE_OBSERVABILITY_ENABLED", undefined)
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-test-key")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-test-key")
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 })))
  vi.spyOn(console, "warn").mockImplementation(() => {})
  mocks.cookies.mockResolvedValue({ getAll: mocks.cookieGetAll, set: mocks.cookieSet })
  mocks.cookieGetAll.mockReturnValue([{ name: "existing", value: "unchanged" }])
  mocks.getClaims.mockResolvedValue({ data: { claims: null }, error: null })
  mocks.getUser.mockResolvedValue({ data: { user: { id: "test-user" } }, error: null })
  mocks.exchangeCodeForSession.mockResolvedValue({ error: null })
  mocks.ensure.mockResolvedValue({})
  mocks.snapshot.mockResolvedValue({})
  mocks.createServerClient.mockReturnValue({ auth: {
    getClaims: mocks.getClaims, getUser: mocks.getUser, exchangeCodeForSession: mocks.exchangeCodeForSession,
  } })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

async function expectSource(options: ClientOptions, source: string) {
  await options.global.fetch("https://example.supabase.co/auth/v1/user")
  expect(JSON.parse(vi.mocked(console.warn).mock.calls.at(-1)?.[0] as string).source).toBe(source)
}

describe("server client observation wiring", () => {
  it("adds server fetch without changing cookie get/set behavior", async () => {
    await (await import("./server")).createClient()
    const options = mocks.createServerClient.mock.calls[0][2] as ClientOptions
    expect(await options.cookies.getAll()).toEqual([{ name: "existing", value: "unchanged" }])
    const attributes = { path: "/", secure: true, sameSite: "lax" as const, maxAge: 3600 }
    await options.cookies.setAll?.([{ name: "session", value: "refreshed", options: attributes }], {})
    expect(mocks.cookieSet).toHaveBeenCalledExactlyOnceWith("session", "refreshed", attributes)
    await expectSource(options, "server")
  })

  it("keeps the admin auth configuration", async () => {
    ;(await import("./admin")).createAdminClient()
    const options = mocks.createSdkClient.mock.calls[0][2]
    expect(options.auth).toEqual({ autoRefreshToken: false, persistSession: false })
    expect(mocks.createSdkClient.mock.calls[0].slice(0, 2)).toEqual(["https://example.supabase.co", "server-test-key"])
    await expectSource(options, "admin")
  })

  it("wires proxy fetch while keeping the existing public-page response", async () => {
    const response = await (await import("./proxy")).updateSession(new NextRequest("https://www.zhuxishe.jp/organization"))
    expect(response.headers.get("x-middleware-next")).toBe("1")
    expect(mocks.getClaims).toHaveBeenCalledOnce()
    expect(mocks.getUser).not.toHaveBeenCalled()
    await expectSource(mocks.createServerClient.mock.calls[0][2], "proxy")
  })

  it("wires callback fetch without changing exchange, refresh cookies or redirect", async () => {
    mocks.exchangeCodeForSession.mockImplementation(async () => {
      const options = mocks.createServerClient.mock.calls[0][2] as ClientOptions
      await options.cookies.setAll?.([{ name: "session", value: "refreshed", options: {
        path: "/", secure: true, sameSite: "lax", maxAge: 3600,
      } }], {})
      return { error: null }
    })
    const req = new NextRequest("https://www.zhuxishe.jp/login/callback?code=test-code&next=/app/profile", {
      headers: { cookie: "existing=unchanged" },
    })
    const response = await (await import("@/app/login/callback/route")).GET(req)
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith("test-code")
    expect(mocks.getUser).toHaveBeenCalledOnce()
    expect(response.status).toBe(307)
    expect(new URL(response.headers.get("location")!).pathname).toBe("/app/profile")
    expect(response.cookies.get("session")).toMatchObject({ value: "refreshed", path: "/", secure: true, sameSite: "lax", maxAge: 3600 })
    expect(req.cookies.get("session")?.value).toBe("refreshed")
    expect(req.cookies.get("existing")?.value).toBe("unchanged")
    await expectSource(mocks.createServerClient.mock.calls[0][2], "callback")
  })

  it("leaves the browser client without an observation fetch", async () => {
    ;(await import("./client")).createClient()
    expect(mocks.createBrowserClient).toHaveBeenCalledExactlyOnceWith("https://example.supabase.co", "public-test-key")
    expect(console.warn).not.toHaveBeenCalled()
  })
})
