import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getAdmin: vi.fn(),
  redirect: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}))

vi.mock("@/lib/auth/admin", () => ({
  getAdmin: mocks.getAdmin,
}))

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}))

import { loginAdmin } from "./actions"

function credentials() {
  const formData = new FormData()
  formData.set("email", "invited-admin@example.com")
  formData.set("password", "valid-password")
  return formData
}

describe("loginAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createClient.mockResolvedValue({
      auth: {
        signInWithPassword: mocks.signInWithPassword,
        signOut: mocks.signOut,
      },
    })
    mocks.signInWithPassword.mockResolvedValue({ error: null })
    mocks.signOut.mockResolvedValue({ error: null })
    mocks.redirect.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`)
    })
  })

  it("uses the admin resolver so a pending email whitelist can bind on first login", async () => {
    mocks.getAdmin.mockResolvedValue({ id: "admin-id", role: "super_admin" })

    await expect(loginAdmin(credentials())).rejects.toThrow("NEXT_REDIRECT:/admin")

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "invited-admin@example.com",
      password: "valid-password",
    })
    expect(mocks.getAdmin).toHaveBeenCalledOnce()
    expect(mocks.signOut).not.toHaveBeenCalled()
  })

  it("signs out an authenticated user who is not an administrator", async () => {
    mocks.getAdmin.mockResolvedValue(null)

    await expect(loginAdmin(credentials())).resolves.toEqual({ error: "你不是管理员" })

    expect(mocks.signOut).toHaveBeenCalledOnce()
  })

  it("does not attempt admin resolution when password authentication fails", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: new Error("invalid credentials") })

    await expect(loginAdmin(credentials())).resolves.toEqual({ error: "邮箱或密码错误" })

    expect(mocks.getAdmin).not.toHaveBeenCalled()
    expect(mocks.signOut).not.toHaveBeenCalled()
  })
})
