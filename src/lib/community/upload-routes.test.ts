import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST as uploadCommunityImage } from "@/app/api/community/uploads/route"
import { POST as uploadProfileAvatar } from "@/app/api/profile/avatar/route"
import {
  COMMUNITY_MAX_IMAGE_BYTES,
  COMMUNITY_MAX_MULTIPART_BYTES,
} from "./constants"

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getCommunityContext: vi.fn(),
  getPlayerInfo: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }))
vi.mock("@/lib/auth/player", () => ({ getPlayerInfo: mocks.getPlayerInfo }))
vi.mock("@/lib/auth/community", () => ({ getCommunityContext: mocks.getCommunityContext }))

const routes = [
  ["community photo", "/api/community/uploads", uploadCommunityImage],
  ["profile avatar", "/api/profile/avatar", uploadProfileAvatar],
] as const

describe.each(routes)("%s upload route", (_name, pathname, handler) => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-id" } } }) },
    })
    mocks.getPlayerInfo.mockResolvedValue({ memberId: "member-id", status: "approved" })
    mocks.getCommunityContext.mockResolvedValue({ canWrite: true, restriction: null })
  })

  it("rejects an oversized declared body before parsing multipart data", async () => {
    const request = new NextRequest(`http://localhost${pathname}`, {
      method: "POST",
      headers: { "content-length": String(COMMUNITY_MAX_MULTIPART_BYTES + 1) },
    })
    const formData = vi.spyOn(request, "formData")

    const response = await handler(request)

    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("4MB") })
    expect(formData).not.toHaveBeenCalled()
  })

  it("rejects a request whose body size cannot be confirmed", async () => {
    const request = new NextRequest(`http://localhost${pathname}`, { method: "POST" })
    const formData = vi.spyOn(request, "formData")

    const response = await handler(request)

    expect(response.status).toBe(411)
    expect(formData).not.toHaveBeenCalled()
  })

  it("checks the actual file size after parsing multipart data", async () => {
    const form = new FormData()
    form.set("file", new File(
      [new Uint8Array(COMMUNITY_MAX_IMAGE_BYTES + 1)],
      "too-large.jpg",
      { type: "image/jpeg" },
    ))
    const request = new NextRequest(`http://localhost${pathname}`, {
      method: "POST",
      headers: { "content-length": String(COMMUNITY_MAX_MULTIPART_BYTES) },
    })
    const formData = vi.spyOn(request, "formData").mockResolvedValue(form)

    const response = await handler(request)

    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("4MB") })
    expect(formData).toHaveBeenCalledOnce()
  })
})
