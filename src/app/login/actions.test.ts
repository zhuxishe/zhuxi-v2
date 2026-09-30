import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }))
vi.mock("@/lib/site-url", () => ({
  buildPublicUrl: (path: string) => `https://www.zhuxishe.jp${path}`,
}))

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))

import { signIn, signOut, signUp } from "./actions"

describe("player email authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createClient.mockResolvedValue({
      auth: { signUp: mocks.signUp, signInWithPassword: mocks.signInWithPassword },
    })
  })

  it("keeps the confirmation-email flow when registration has no session", async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: { identities: [{ provider: "email" }] }, session: null },
      error: null,
    })

    expect(await signUp("  NewPlayer@Example.com ", "test-password")).toEqual({
      success: true,
      requiresEmailConfirmation: true,
    })
    expect(mocks.signUp).toHaveBeenCalledWith({
      email: "newplayer@example.com",
      password: "test-password",
      options: { emailRedirectTo: "https://www.zhuxishe.jp/login/callback" },
    })
  })

  it("lets a registration with an immediate session continue into the app", async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: { identities: [{ provider: "email" }] }, session: { user: { id: "new-user" } } },
      error: null,
    })

    expect(await signUp("newplayer@example.com", "test-password")).toEqual({
      success: true,
      requiresEmailConfirmation: false,
    })
  })

  it("does not route an obfuscated duplicate registration into the app", async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: { identities: [] }, session: null },
      error: null,
    })

    expect(await signUp("existing@example.com", "test-password")).toEqual({
      error: "email_exists_with_oauth",
    })
  })

  it("normalizes the email on password login", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: null })
    expect(await signIn(" Player@Example.com ", "test-password")).toEqual({ success: true })
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "player@example.com", password: "test-password",
    })
  })
})

describe("player sign out", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createClient.mockResolvedValue({ auth: { signOut: mocks.signOut } })
    mocks.redirect.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`)
    })
  })

  it("redirects to the public homepage after signing out", async () => {
    mocks.signOut.mockResolvedValue({ error: null })

    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT:/")
    expect(mocks.signOut).toHaveBeenCalledOnce()
  })

  it("keeps the user on the page and reports a failed sign out", async () => {
    mocks.signOut.mockResolvedValue({ error: new Error("Auth service unavailable") })
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {})

    try {
      await expect(signOut()).resolves.toEqual({ error: "logout_failed" })
      expect(mocks.redirect).not.toHaveBeenCalled()
    } finally {
      errorLog.mockRestore()
    }
  })
})
