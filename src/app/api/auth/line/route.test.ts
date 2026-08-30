import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  process.env.LINE_CHANNEL_ID = "test-channel"
  process.env.LINE_USER_SECRET = "test-line-user-secret"
  return { createAdminClient: vi.fn() }
})

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }))

import { POST } from "./route"

function request() {
  return new NextRequest("http://localhost/api/auth/line", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      idToken: "verified-token",
      profile: { userId: "U123", displayName: "LINE Member" },
    }),
  })
}

function verifiedLineFetch() {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
    JSON.stringify({ sub: "U123" }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  )))
}

function existingMemberClient(authUser: { email: string; app_metadata?: Record<string, unknown> }) {
  const signInWithPassword = vi.fn().mockResolvedValue({
    data: { session: { access_token: "access", refresh_token: "refresh" } },
    error: null,
  })
  const createUser = vi.fn()
  const maybeSingle = vi.fn().mockResolvedValue({
    data: { id: "member-id", user_id: "auth-user-id", status: "approved" },
    error: null,
  })
  return {
    client: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle })),
        })),
      })),
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({ data: { user: authUser }, error: null }),
          createUser,
        },
        signInWithPassword,
      },
    },
    createUser,
    signInWithPassword,
  }
}

describe("LINE login bridge identity boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    verifiedLineFetch()
  })

  it("fails closed when LINE is attached to a normal email/Google Auth user", async () => {
    const { client, createUser, signInWithPassword } = existingMemberClient({
      email: "member@example.com",
      app_metadata: { provider: "google" },
    })
    mocks.createAdminClient.mockReturnValue(client)

    const response = await POST(request())

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: "LINE account is linked to another sign-in method",
      code: "line_linked_external_auth",
    })
    expect(signInWithPassword).not.toHaveBeenCalled()
    expect(createUser).not.toHaveBeenCalled()
  })

  it("reuses the existing deterministic credentials only for a LINE-native Auth user", async () => {
    const { client, createUser, signInWithPassword } = existingMemberClient({
      email: "line_U123@line.zhuxi.app",
      app_metadata: { auth_origin: "line_bridge", line_user_id: "U123" },
    })
    mocks.createAdminClient.mockReturnValue(client)

    const response = await POST(request())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      session: { access_token: "access", refresh_token: "refresh" },
      isNewUser: false,
    })
    expect(signInWithPassword).toHaveBeenCalledOnce()
    expect(createUser).not.toHaveBeenCalled()
  })

  it("creates a marked LINE-native Auth user and canonical LINE member on first login", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    const createUser = vi.fn().mockResolvedValue({
      data: { user: { id: "new-auth-user-id" } },
      error: null,
    })
    const signInWithPassword = vi.fn().mockResolvedValue({
      data: { session: { access_token: "access", refresh_token: "refresh" } },
      error: null,
    })
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
        insert,
      })),
      auth: {
        admin: { createUser },
        signInWithPassword,
      },
    })

    const response = await POST(request())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ isNewUser: true })
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: "line_U123@line.zhuxi.app",
      app_metadata: { auth_origin: "line_bridge", line_user_id: "U123" },
    }))
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "new-auth-user-id",
      line_user_id: "U123",
      record_source: "line",
      account_status: "active",
      profile_stage: "not_started",
    }))
  })
})
