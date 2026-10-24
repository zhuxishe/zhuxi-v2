import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "./route"

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(), exchange: vi.fn(), getUser: vi.fn(), ensure: vi.fn(), snapshot: vi.fn(),
}))
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }))
vi.mock("@/lib/member-master/rpc", () => ({
  ensureMyMemberRecord: mocks.ensure, resolveMemberRouteSnapshot: mocks.snapshot,
  getMemberMasterDiagnostic: () => "TEST",
}))
vi.mock("@/lib/site-url", () => ({ buildPublicUrl: (path: string) => `https://www.zhuxishe.jp${path}` }))

let setCookies: (cookies: { name: string; value: string; options: { path: string; maxAge: number } }[]) => void
function request(next: string, withCode = true) {
  return new NextRequest(`https://www.zhuxishe.jp/login/callback?next=${encodeURIComponent(next)}${withCode ? "&code=test-code" : ""}`)
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-public-key")
  mocks.createServerClient.mockImplementation((_url, _key, options) => {
    setCookies = options.cookies.setAll
    return { auth: { exchangeCodeForSession: mocks.exchange, getUser: mocks.getUser } }
  })
  mocks.exchange.mockResolvedValue({ error: null })
  mocks.getUser.mockResolvedValue({ data: { user: { id: "verified" } }, error: null })
  mocks.ensure.mockResolvedValue({ memberId: "player" })
  mocks.snapshot.mockResolvedValue({
    status: "approved", accountStatus: "active", membershipType: "player", profileStage: "complete",
    onboardingStep: 4, hasIdentity: true,
  })
})
afterEach(() => vi.unstubAllEnvs())

describe("player OAuth return navigation", () => {
  it.each([
    "/app/matching/survey?round=round-id&from=participation",
    "/app/matches/rounds/round-id?from=notification",
    "/app/matches/result-id#partners",
  ])("returns a verified approved player to the original safe page: %s", async (next) => {
    mocks.exchange.mockImplementation(async () => {
      setCookies([{ name: "session", value: "fresh", options: { path: "/", maxAge: 3600 } }])
      return { error: null }
    })
    const response = await GET(request(next))
    expect(response.headers.get("location")).toBe(`https://www.zhuxishe.jp${next}`)
    expect(response.cookies.get("session")?.value).toBe("fresh")
    expect(mocks.ensure).toHaveBeenCalledOnce()
  })

  it.each(["//example.com/app", "/application", "/app/%2e%2e/admin", "/app/\\../admin"])(
    "rejects unsafe callback destinations: %s", async (next) => {
      const response = await GET(request(next))
      expect(response.headers.get("location")).toBe("https://www.zhuxishe.jp/app")
    },
  )

  it("retains lifecycle routing instead of bypassing membership restrictions", async () => {
    mocks.snapshot.mockResolvedValue({ status: "approved", accountStatus: "suspended", membershipType: "player", hasIdentity: true })
    const response = await GET(request("/app/matching/survey?round=kept"))
    expect(response.headers.get("location")).toBe("https://www.zhuxishe.jp/app/inactive")
  })

  it.each(["missing-code", "exchange", "verification", "member"])("retains safe context if OAuth must be retried after %s", async (failure) => {
    const next = "/app/matching/survey?round=one&from=participation&next=https://example.com"
    if (failure === "exchange") mocks.exchange.mockResolvedValue({ error: { message: "expired code" } })
    if (failure === "verification") mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid session" } })
    if (failure === "member") mocks.ensure.mockRejectedValue(new Error("database unavailable"))
    const response = await GET(request(next, failure !== "missing-code"))
    const destination = new URL(response.headers.get("location")!)
    expect(destination.origin).toBe("https://www.zhuxishe.jp")
    expect(destination.pathname).toBe("/login")
    expect(destination.searchParams.getAll("next")).toEqual([next])
    expect(destination.searchParams.get("error")).toBe("oauth_failed")
  })

  it("preserves SDK invalid-session cookie cleanup on a failed exchange", async () => {
    mocks.exchange.mockImplementation(async () => {
      setCookies([{ name: "session", value: "", options: { path: "/", maxAge: 0 } }])
      return { error: { message: "expired code" } }
    })
    const response = await GET(request("/app/matches/rounds/round-id"))
    expect(response.cookies.get("session")).toMatchObject({ value: "", maxAge: 0 })
    expect(new URL(response.headers.get("location")!).searchParams.get("next")).toBe("/app/matches/rounds/round-id")
  })
})
