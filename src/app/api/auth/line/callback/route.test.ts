import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  process.env.LINE_CHANNEL_ID = "test-channel"
  process.env.LINE_CHANNEL_SECRET = "test-channel-secret"
  return {
    createClient: vi.fn(),
    createAdminClient: vi.fn(),
  }
})

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }))

import { GET } from "./route"

function request(state = "state123") {
  return new NextRequest(
    `https://zhuxishe.jp/api/auth/line/callback?code=oauth-code&state=${state}`,
    { headers: { cookie: "line_oauth_state=state123" } }
  )
}

function verifiedLineFetch() {
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(new Response(
      JSON.stringify({ access_token: "line-access-token" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    ))
    .mockResolvedValueOnce(new Response(
      JSON.stringify({ userId: "U123" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )))
}

describe("LINE OAuth callback identity binding", () => {
  const rpc = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "auth-user-id" } } }),
      },
    })
    mocks.createAdminClient.mockReturnValue({ rpc })
    rpc.mockResolvedValue({ data: { changed: true }, error: null })
    verifiedLineFetch()
  })

  it("calls the audited service RPC only after state and LINE profile verification", async () => {
    const response = await GET(request())

    expect(response.status).toBe(307)
    expect(new URL(response.headers.get("location")!).pathname).toBe("/app/profile")
    expect(rpc).toHaveBeenCalledWith("service_set_member_line_identity", {
      p_user_id: "auth-user-id",
      p_line_user_id: "U123",
      p_operation: "bind",
    })
    expect(response.cookies.get("line_oauth_state")?.value).toBe("")
  })

  it("rejects a state mismatch before LINE or service-role calls", async () => {
    const response = await GET(request("wrong-state"))

    expect(response.status).toBe(307)
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("redirects with a safe conflict message and never leaks database details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: "23505",
        message: "MEMBER_MASTER_LINE_IDENTITY_CONFLICT",
        details: "private member row details",
      },
    })

    const response = await GET(request())
    const redirect = new URL(response.headers.get("location")!)

    expect(response.status).toBe(307)
    expect(redirect.searchParams.get("line_error")).toBe(
      "This LINE account cannot be linked to this user"
    )
    expect(redirect.toString()).not.toContain("private")
    expect(redirect.toString()).not.toContain("MEMBER_MASTER")
  })
})
