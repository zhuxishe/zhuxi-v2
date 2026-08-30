import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }))

import { DELETE, POST } from "./route"

function request(method: "POST" | "DELETE", body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/auth/line/link", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("LINE self-service link route", () => {
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
  })

  it("binds only after LINE verifies the claimed token subject", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ sub: "U123" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    ))
    vi.stubGlobal("fetch", fetchMock)

    const response = await POST(request("POST", { idToken: "verified-token", lineUserId: "U123" }))

    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith("service_set_member_line_identity", {
      p_user_id: "auth-user-id",
      p_line_user_id: "U123",
      p_operation: "bind",
    })
  })

  it("rejects a subject mismatch before creating a service-role client", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ sub: "U999" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )))

    const response = await POST(request("POST", { idToken: "verified-token", lineUserId: "U123" }))

    expect(response.status).toBe(403)
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it("uses compare-and-clear input when the authenticated user unbinds", async () => {
    const response = await DELETE(request("DELETE", { lineUserId: "U123" }))

    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith("service_set_member_line_identity", {
      p_user_id: "auth-user-id",
      p_line_user_id: "U123",
      p_operation: "unbind",
    })
  })

  it("returns a stable safe conflict without leaking the database error", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: "23505",
        message: "MEMBER_MASTER_LINE_IDENTITY_CONFLICT",
        details: "private.member_profile_audit_log",
      },
    })

    const response = await DELETE(request("DELETE", { lineUserId: "U123" }))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: "This LINE account cannot be linked to this user",
      code: "line_identity_conflict",
    })
  })

  it("distinguishes malformed input from an unexpected service failure", async () => {
    const malformed = new NextRequest("http://localhost/api/auth/line/link", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: "{",
    })
    const malformedResponse = await DELETE(malformed)
    expect(malformedResponse.status).toBe(400)
    expect(mocks.createAdminClient).not.toHaveBeenCalled()

    rpc.mockRejectedValue(new Error("private database details"))
    const serviceResponse = await DELETE(request("DELETE", { lineUserId: "U123" }))
    expect(serviceResponse.status).toBe(500)
    await expect(serviceResponse.json()).resolves.toEqual({
      error: "LINE account update failed",
      code: "line_identity_update_failed",
    })
  })
})
