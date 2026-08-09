import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { NextRequest } from "next/server"

const { createAdminClientMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}))

import { GET } from "./route"

const originalCronSecret = process.env.CRON_SECRET

function request(authorization?: string) {
  return {
    headers: {
      get(name: string) {
        return name.toLowerCase() === "authorization" ? authorization ?? null : null
      },
    },
  } as NextRequest
}

function restoreCronSecret() {
  if (originalCronSecret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = originalCronSecret
}

describe("GET /api/community/maintenance", () => {
  beforeEach(() => {
    createAdminClientMock.mockReset()
    delete process.env.CRON_SECRET
  })

  afterEach(() => {
    restoreCronSecret()
  })

  it("returns 503 without CRON_SECRET and never creates a database client", async () => {
    const response = await GET(request("Bearer any-token"))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: "Community maintenance is not configured",
    })
    expect(createAdminClientMock).not.toHaveBeenCalled()
  })

  it("returns 401 for an invalid bearer token and never creates a database client", async () => {
    process.env.CRON_SECRET = "expected-cron-secret"

    const response = await GET(request("Bearer wrong-cron-secret"))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
    expect(createAdminClientMock).not.toHaveBeenCalled()
  })

  it("returns 200 for an authorized empty queue and calls only the maintenance RPCs", async () => {
    process.env.CRON_SECRET = "expected-cron-secret"
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: 0, error: null })
      .mockResolvedValueOnce({ data: { notifications: 0 }, error: null })
      .mockResolvedValueOnce({ data: [], error: null })
    const storageFrom = vi.fn()
    createAdminClientMock.mockReturnValue({
      rpc,
      storage: { from: storageFrom },
    })

    const response = await GET(request("Bearer expected-cron-secret"))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      announcementsSent: 0,
      retention: { notifications: 0 },
      mediaRemoved: 0,
      mediaFailed: 0,
    })
    expect(createAdminClientMock).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledTimes(3)
    expect(rpc).toHaveBeenNthCalledWith(1, "community_dispatch_scheduled_announcements")
    expect(rpc).toHaveBeenNthCalledWith(2, "community_purge_expired_data")
    expect(rpc).toHaveBeenNthCalledWith(3, "community_admin_claim_media_cleanup", {
      p_limit: 25,
    })
    expect(storageFrom).not.toHaveBeenCalled()
  })
})
