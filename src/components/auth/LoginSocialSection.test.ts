import { isValidElement, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ oauth: vi.fn(), push: vi.fn() }))
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(), useState: (initial: unknown) => [initial, vi.fn()], useEffect: vi.fn(),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { signInWithOAuth: mocks.oauth } }) }))
vi.mock("@/lib/site-url", () => ({ buildPublicUrl: (path: string) => `https://www.zhuxishe.jp${path}` }))

import { LoginSocialSection } from "./LoginSocialSection"

function googleClick(node: ReactNode): (() => Promise<void>) | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const click = googleClick(child)
      if (click) return click
    }
  } else if (isValidElement<{ children?: ReactNode; onClick?: () => Promise<void> }>(node)) {
    const children = node.props.children
    if (Array.isArray(children) && children.includes("googleLogin")) return node.props.onClick
    return googleClick(children)
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.oauth.mockResolvedValue({ error: null })
})

describe("Google login safe return", () => {
  it.each([
    ["/app/matching/survey?round=one&from=participation&next=https://example.com", "/app/matching/survey?round=one&from=participation&next=https://example.com"],
    ["/app/matches/rounds/round-id?from=notification", "/app/matches/rounds/round-id?from=notification"],
    ["//example.com/app", "/app"],
    ["/app/%2e%2e/admin", "/app"],
  ])("uses a validated callback destination for %s", async (nextPath, expected) => {
    const onError = vi.fn()
    const click = googleClick(LoginSocialSection({ onError, nextPath }))
    expect(click).toBeTypeOf("function")
    await click!()
    const options = mocks.oauth.mock.calls[0][0]
    expect(options.provider).toBe("google")
    const callback = new URL(options.options.redirectTo)
    expect(callback.origin).toBe("https://www.zhuxishe.jp")
    expect(callback.pathname).toBe("/login/callback")
    expect(callback.searchParams.getAll("next")).toEqual([expected])
    expect(options.options.queryParams).toEqual({ prompt: "consent select_account" })
    expect(mocks.push).not.toHaveBeenCalled()
  })
})
