import type { CookieMethodsServer } from "@supabase/ssr"
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { updateSession } from "./proxy"

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getClaims: vi.fn(),
  getUser: vi.fn(),
}))

vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }))

const refreshHeaders = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
}

let serverCookies: CookieMethodsServer

function request(pathname = "/login", method = "GET") {
  return new NextRequest(`https://www.zhuxishe.jp${pathname}`, {
    method,
    headers: { cookie: "existing-cookie=unchanged" },
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-public-key")
  mocks.createServerClient.mockImplementation((_url, _key, options: { cookies: CookieMethodsServer }) => {
    serverCookies = options.cookies
    return { auth: { getClaims: mocks.getClaims, getUser: mocks.getUser } }
  })
  mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "test-user" } }, error: null })
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
})

afterEach(() => vi.unstubAllEnvs())

describe("updateSession login navigation", () => {
  it.each(["GET", "HEAD"])("redirects an existing user on %s /login without another sign-in", async (method) => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "test-user" } }, error: null })

    const response = await updateSession(request("/login", method))

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe("https://www.zhuxishe.jp/app")
    expect(response.headers.get("x-middleware-next")).toBeNull()
    expect(mocks.getClaims).toHaveBeenCalledOnce()
    expect(mocks.getUser).toHaveBeenCalledOnce()
    for (const [name, value] of Object.entries(refreshHeaders)) {
      expect(response.headers.get(name)).toBe(value)
    }
  })

  it("preserves a safe deep link and its query/hash on the current host", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "test-user" } }, error: null })
    const next = "/app/community/treehole/123?sort=recent#comments"

    const response = await updateSession(request(`/login?next=${encodeURIComponent(next)}`))

    expect(response.headers.get("location")).toBe(`https://www.zhuxishe.jp${next}`)
  })

  it.each(["//example.com", "/application", "/app/%2e%2e/admin", "/app/\\../admin"])(
    "redirects to /app when next is unsafe: %s",
    async (next) => {
      mocks.getUser.mockResolvedValue({ data: { user: { id: "test-user" } }, error: null })
      const response = await updateSession(request(`/login?next=${encodeURIComponent(next)}`))
      expect(response.headers.get("location")).toBe("https://www.zhuxishe.jp/app")
    },
  )

  it.each([
    { data: { user: null }, error: null },
    { data: { user: null }, error: { message: "Session revoked" } },
    { data: { user: { id: "test-user" } }, error: { message: "User validation failed" } },
  ])("keeps the login form when user validation fails, even with valid claims", async (result) => {
    mocks.getUser.mockResolvedValue(result)

    const response = await updateSession(request())

    expect(response.status).toBe(200)
    expect(response.headers.get("location")).toBeNull()
    expect(response.headers.get("x-middleware-next")).toBe("1")
    expect(mocks.getUser).toHaveBeenCalledOnce()
  })

  it.each([
    ["/login", "POST"],
    ["/login/callback?code=test-code", "GET"],
    ["/admin/login", "GET"],
    ["/app", "GET"],
    ["/", "GET"],
    ["/organization", "GET"],
  ])("keeps the existing flow for %s %s", async (pathname, method) => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "test-user" } }, error: null })

    const response = await updateSession(request(pathname, method))

    expect(response.headers.get("location")).toBeNull()
    expect(response.headers.get("x-middleware-next")).toBe("1")
    expect(response.headers.get("x-middleware-request-x-next-pathname")).toBe(pathname.split("?")[0])
    expect(mocks.getClaims).toHaveBeenCalledOnce()
    expect(mocks.getUser).not.toHaveBeenCalled()
  })

  it("preserves refresh cookies, attributes and cache headers across both auth checks", async () => {
    mocks.getClaims.mockImplementation(async () => {
      await serverCookies.setAll?.([
        { name: "session.0", value: "refreshed-part-zero", options: { path: "/", secure: true, sameSite: "lax", maxAge: 3600 } },
        { name: "old-session", value: "", options: { path: "/", maxAge: 0 } },
      ], refreshHeaders)
      return { data: { claims: { sub: "test-user" } }, error: null }
    })
    mocks.getUser.mockImplementation(async () => {
      await serverCookies.setAll?.([
        { name: "session.1", value: "refreshed-part-one", options: { path: "/", secure: true, sameSite: "lax", maxAge: 3600 } },
      ], {})
      return { data: { user: { id: "test-user" } }, error: null }
    })
    const incoming = request()

    const response = await updateSession(incoming)

    expect(response.status).toBe(307)
    expect(response.cookies.get("session.0")).toMatchObject({
      value: "refreshed-part-zero", path: "/", secure: true, sameSite: "lax", maxAge: 3600,
    })
    expect(response.cookies.get("session.1")?.value).toBe("refreshed-part-one")
    expect(response.cookies.get("old-session")).toMatchObject({ value: "", maxAge: 0 })
    expect(incoming.cookies.get("session.0")?.value).toBe("refreshed-part-zero")
    expect(incoming.cookies.get("session.1")?.value).toBe("refreshed-part-one")
    expect(await serverCookies.getAll()).toContainEqual({ name: "existing-cookie", value: "unchanged" })
    for (const [name, value] of Object.entries(refreshHeaders)) {
      expect(response.headers.get(name)).toBe(value)
    }
  })

  it("forwards refreshed cookies and Supabase cache headers on a public page", async () => {
    mocks.getClaims.mockImplementation(async () => {
      await serverCookies.setAll?.([
        { name: "session", value: "refreshed", options: { path: "/", secure: true } },
      ], refreshHeaders)
      return { data: { claims: { sub: "test-user" } }, error: null }
    })

    const response = await updateSession(request("/organization"))

    expect(response.cookies.get("session")?.value).toBe("refreshed")
    expect(response.headers.get("x-middleware-request-cookie")).toContain("session=refreshed")
    expect(response.headers.get("x-middleware-request-x-next-pathname")).toBe("/organization")
    for (const [name, value] of Object.entries(refreshHeaders)) {
      expect(response.headers.get(name)).toBe(value)
    }
    expect(mocks.getUser).not.toHaveBeenCalled()
  })
})
