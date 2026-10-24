import { describe, expect, it } from "vitest"
import { buildPlayerLoginPath, getSafePlayerNextPath } from "./player-next-path"

describe("getSafePlayerNextPath", () => {
  it.each([
    "/app",
    "/app/",
    "/app/profile",
    "/app/community/treehole/123?sort=recent#comments",
    "/app?tab=matches#upcoming",
    "/app/search?q=%E7%AB%B9%E6%BA%AA&from=%2Fapp%2Fprofile",
    "/app/search?url=https%3A%2F%2Fexample.com%2Farticle&discount=10%25",
  ])("preserves a Player destination: %s", (next) => {
    expect(getSafePlayerNextPath(next)).toBe(next)
  })

  it("normalizes a valid URL without losing its query or hash", () => {
    expect(getSafePlayerNextPath("/app/search?q=竹溪#活动")).toBe(
      "/app/search?q=%E7%AB%B9%E6%BA%AA#%E6%B4%BB%E5%8A%A8",
    )
  })

  it.each([
    null,
    undefined,
    "",
    "https://example.com/app",
    "//example.com/app",
    "javascript:alert(1)",
    "/login",
    "/admin",
    "/application",
    "/app-settings",
    "/app/../login",
    "/app/profile/../../admin",
    "/app/./profile",
    "/app/%2e%2e/login",
    "/app/%252e%252e/login",
    "/app/%2f..%2flogin",
    "/app%2fprofile",
    "/app/%5c../login",
    "/app/\\../login",
    "/\\example.com/app",
    "/app/\nprofile",
    "/app/%0d%0aLocation:https://example.com",
    "/app/profile?x=%00",
    "/app/%3fnext=//example.com",
    "/app/%23profile",
    "/app/%invalid",
  ])("falls back for an unsafe or non-Player destination: %s", (next) => {
    expect(getSafePlayerNextPath(next)).toBe("/app")
  })
})

describe("buildPlayerLoginPath", () => {
  it("nests the original query instead of allowing it to inject login parameters", () => {
    const next = "/app/matching/survey?round=one&round=two&from=participation&next=https://example.com&reason=other#answers"
    const login = new URL(buildPlayerLoginPath(next, { sessionExpired: true }), "https://www.zhuxishe.jp")
    expect(login.pathname).toBe("/login")
    expect(login.searchParams.getAll("next")).toEqual([next])
    expect(login.searchParams.getAll("reason")).toEqual(["session_expired"])
    expect(login.hash).toBe("")
  })

  it("keeps safe return navigation when OAuth has to be retried", () => {
    const next = "/app/matches/rounds/round-id?from=notification"
    const login = new URL(buildPlayerLoginPath(next, { oauthFailed: true }), "https://www.zhuxishe.jp")
    expect(login.searchParams.get("next")).toBe(next)
    expect(login.searchParams.get("error")).toBe("oauth_failed")
    expect(login.searchParams.has("reason")).toBe(false)
  })

  it.each(["//example.com/app", "/app/../admin", "/app/%2f../admin", "/application", "javascript:alert(1)"])(
    "never carries an unsafe destination into login: %s", (next) => {
      const login = new URL(buildPlayerLoginPath(next), "https://www.zhuxishe.jp")
      expect(login.searchParams.get("next")).toBe("/app")
    },
  )
})
