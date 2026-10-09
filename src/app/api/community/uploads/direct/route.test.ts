import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "./route"
import { COMMUNITY_MAX_IMAGE_BYTES } from "@/lib/community/constants"
import { COMMUNITY_UPLOAD_STAGING_BUCKET } from "@/lib/community/direct-upload-server"

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), getPlayerInfo: vi.fn(), getCommunityContext: vi.fn(),
  createAdminClient: vi.fn(), normalizeCommunityImage: vi.fn(),
}))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock("@/lib/auth/player", () => ({ getPlayerInfo: mocks.getPlayerInfo }))
vi.mock("@/lib/auth/community", () => ({ getCommunityContext: mocks.getCommunityContext }))
vi.mock("@/lib/community/normalize-image", () => ({ normalizeCommunityImage: mocks.normalizeCommunityImage }))

const uploadId = "10000000-0000-4000-8000-000000000001"
const session = {
  id: uploadId, kind: "photo", expected_size: 4, staging_path: "user/original",
  state: "processing", claim_token: "claim-token", storage_path: "user/photos/main.webp",
  thumbnail_path: "user/photos/thumb.webp", result: null,
}
const completedResult = { storagePath: session.storage_path, thumbnailPath: session.thumbnail_path, width: 20, height: 10, byteSize: 3, mimeType: "image/webp" }
const rpc = vi.fn()
const storage = { createSignedUploadUrl: vi.fn(), download: vi.fn(), upload: vi.fn(), remove: vi.fn() }
const storageFrom = vi.fn()
const lookup = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }

function request(body: unknown) {
  return new NextRequest("http://localhost/api/community/uploads/direct", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  })
}

describe("direct community image upload", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co"
    mocks.createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user" } } }) } })
    mocks.getPlayerInfo.mockResolvedValue({ memberId: "member", status: "approved" })
    mocks.getCommunityContext.mockResolvedValue({ canWrite: true, restriction: null })
    lookup.select.mockReturnValue(lookup)
    lookup.eq.mockReturnValue(lookup)
    lookup.maybeSingle.mockResolvedValue({ data: { kind: "photo" }, error: null })
    storageFrom.mockReturnValue(storage)
    mocks.createAdminClient.mockReturnValue({ rpc, schema: () => ({ from: () => lookup }), storage: { from: storageFrom } })
    storage.createSignedUploadUrl.mockResolvedValue({ data: { token: "one-path-token" }, error: null })
    storage.download.mockResolvedValue({ data: new Blob([new Uint8Array(4)]), error: null })
    storage.upload.mockResolvedValue({ error: null })
    storage.remove.mockResolvedValue({ error: null })
    mocks.normalizeCommunityImage.mockResolvedValue({ main: Buffer.from([1, 2, 3]), thumbnail: Buffer.from([4]), width: 20, height: 10 })
    rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === "community_prepare_direct_upload") return { data: session, error: null }
      if (name === "community_claim_direct_upload") return { data: session, error: null }
      if (name === "community_finish_direct_upload") return { data: args.p_result, error: null }
      if (name === "community_cancel_direct_upload") return { data: true, error: null }
      throw new Error("Unexpected RPC")
    })
  })

  it("requires an approved authenticated member before issuing tokens", async () => {
    mocks.getPlayerInfo.mockResolvedValue({ status: "pending" })
    expect((await POST(request({ action: "prepare", kind: "photo", size: 10 }))).status).toBe(403)
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it("grants only a server-selected path with overwrite disabled for a 20MiB image", async () => {
    const response = await POST(request({ action: "prepare", kind: "photo", size: COMMUNITY_MAX_IMAGE_BYTES, path: "someone/else" }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ uploadId, bucket: COMMUNITY_UPLOAD_STAGING_BUCKET, path: session.staging_path, token: "one-path-token", endpoint: "https://project.storage.supabase.co/storage/v1/upload/resumable/sign" })
    expect(storage.createSignedUploadUrl).toHaveBeenCalledWith(session.staging_path, { upsert: false })
    expect(rpc).toHaveBeenCalledWith("community_prepare_direct_upload", { p_member_id: "member", p_user_id: "user", p_kind: "photo", p_expected_size: COMMUNITY_MAX_IMAGE_BYTES })
  })

  it("rejects over-limit and malformed requests before allocating a session", async () => {
    expect((await POST(request({ action: "prepare", kind: "photo", size: COMMUNITY_MAX_IMAGE_BYTES + 1 }))).status).toBe(413)
    expect((await POST(request({ action: "prepare", kind: "photo", size: 20, name: "x".repeat(5000) }))).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it("retains photo mute and avatar ban protections while personal avatar stays independent", async () => {
    mocks.getCommunityContext.mockResolvedValue({ canWrite: false, restriction: { type: "mute" } })
    expect((await POST(request({ action: "prepare", kind: "photo", size: 4 }))).status).toBe(403)
    mocks.getCommunityContext.mockResolvedValue({ canWrite: false, restriction: { type: "permanent_ban" } })
    expect((await POST(request({ action: "prepare", kind: "avatar", size: 4 }))).status).toBe(403)
    expect((await POST(request({ action: "prepare", kind: "profile-avatar", size: 4 }))).status).toBe(200)
  })

  it("refuses access to another member's upload before claiming or downloading it", async () => {
    lookup.maybeSingle.mockResolvedValue({ data: null, error: null })
    expect((await POST(request({ action: "complete", uploadId }))).status).toBe(404)
    expect(lookup.eq).toHaveBeenCalledWith("member_id", "member")
    expect(rpc).not.toHaveBeenCalled()
    expect(storage.download).not.toHaveBeenCalled()
  })

  it("returns completed uploads idempotently and never processes a busy claim twice", async () => {
    rpc.mockResolvedValueOnce({ data: { ...session, state: "completed", result: completedResult }, error: null })
    await expect((await POST(request({ action: "complete", uploadId }))).json()).resolves.toEqual(completedResult)
    rpc.mockResolvedValueOnce({ data: { ...session, busy: true }, error: null })
    const busy = await POST(request({ action: "complete", uploadId }))
    expect(busy.status).toBe(202)
    await expect(busy.json()).resolves.toEqual({ pending: true, retryAfterMs: 1500 })
    expect(storage.download).not.toHaveBeenCalled()
  })

  it("checks actual downloaded bytes and does not register mismatched originals", async () => {
    storage.download.mockResolvedValue({ data: new Blob([new Uint8Array(8)]), error: null })
    const response = await POST(request({ action: "complete", uploadId }))
    expect(response.status).toBe(400)
    expect(mocks.normalizeCommunityImage).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith("community_cancel_direct_upload", { p_upload_id: uploadId, p_member_id: "member", p_claim_token: "claim-token" })
  })

  it("registers normalized images before returning a preview and removes the raw original", async () => {
    const response = await POST(request({ action: "complete", uploadId }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject(completedResult)
    expect(storage.upload).toHaveBeenCalledTimes(2)
    expect(rpc).toHaveBeenCalledWith("community_finish_direct_upload", expect.objectContaining({ p_claim_token: "claim-token", p_result: expect.objectContaining({ byteSize: 3, mimeType: "image/webp" }) }))
    expect(storage.remove).toHaveBeenCalledWith([session.staging_path])
  })

  it("recovers a lost finish response without deleting already committed media", async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === "community_claim_direct_upload") return { data: session, error: null }
      if (name === "community_finish_direct_upload") return { error: { message: "response lost" } }
      if (name === "community_cancel_direct_upload") return { data: false, error: null }
      throw new Error("Unexpected RPC")
    })
    lookup.maybeSingle.mockResolvedValueOnce({ data: { kind: "photo" }, error: null })
      .mockResolvedValueOnce({ data: { state: "completed", result: completedResult }, error: null })
    const response = await POST(request({ action: "complete", uploadId }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(completedResult)
    expect(storage.remove).not.toHaveBeenCalled()
  })
  it("defers concurrent completion before downloading or claiming a second original", async () => {
    let finishDownload!: (value: { data: Blob; error: null }) => void
    let downloadStarted!: () => void
    const started = new Promise<void>(resolve => { downloadStarted = resolve })
    storage.download.mockImplementationOnce(() => {
      downloadStarted()
      return new Promise(resolve => { finishDownload = resolve })
    })
    const first = POST(request({ action: "complete", uploadId }))
    await started
    const second = await POST(request({ action: "complete", uploadId }))
    expect(second.status).toBe(202)
    expect(storage.download).toHaveBeenCalledOnce()
    expect(rpc).toHaveBeenCalledTimes(1)
    finishDownload({ data: new Blob([new Uint8Array(4)]), error: null })
    expect((await first).status).toBe(200)
    // Completion releases admission even when the next original is malformed.
    storage.download.mockResolvedValueOnce({ data: new Blob([new Uint8Array(8)]), error: null })
    const invalid = await POST(request({ action: "complete", uploadId }))
    expect(invalid.status).toBe(400)
    await expect(invalid.json()).resolves.toMatchObject({ resetUpload: true })
    expect((await POST(request({ action: "complete", uploadId }))).status).toBe(200)
  })

  it("preserves uploaded originals when cancellation status is uncertain", async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === "community_claim_direct_upload") return { data: session, error: null }
      return { error: { message: "database temporarily unavailable" } }
    })
    const response = await POST(request({ action: "complete", uploadId }))
    const payload = await response.json()
    expect(payload.resetUpload).toBeUndefined()
    expect(storage.remove).not.toHaveBeenCalled()
  })

})
