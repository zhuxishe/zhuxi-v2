import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  removeStorageObjectsOrQueue: vi.fn(),
  runContentMediaCleanupJobsForContent: vi.fn(),
  validateDirectlyUploadedImage: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock("@/lib/content-media-cleanup", () => ({
  removeStorageObjectsOrQueue: mocks.removeStorageObjectsOrQueue,
  runContentMediaCleanupJobsForContent: mocks.runContentMediaCleanupJobsForContent,
}))
vi.mock("@/lib/direct-image-upload", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/direct-image-upload")>(),
  validateDirectlyUploadedImage: mocks.validateDirectlyUploadedImage,
}))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))

import {
  finalizeScriptCoverUpload,
  prepareScriptCoverUpload,
} from "./upload-actions"

const scriptId = "11111111-1111-4111-8111-111111111111"
const adminId = "22222222-2222-4222-8222-222222222222"
const initialUpdatedAt = "2026-09-03T10:00:00.000Z"
const nextUpdatedAt = "2026-09-03T10:01:00.000Z"
const reason = "替换剧本封面并保留审计记录"

describe("script cover signed upload actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ id: adminId, role: "admin" })
    mocks.removeStorageObjectsOrQueue.mockResolvedValue({ success: true, queued: false })
    mocks.runContentMediaCleanupJobsForContent.mockResolvedValue({ success: true, pending: 0 })
    mocks.validateDirectlyUploadedImage.mockResolvedValue({
      ok: true,
      size: 1024,
      type: "image/png",
    })
  })

  it("signs one non-upsert path bound to the active script", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { cover_url: null, archived_at: null, updated_at: initialUpdatedAt },
      error: null,
    })
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle }
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    mocks.createClient.mockResolvedValue({ from: vi.fn().mockReturnValue(query) })
    const createSignedUploadUrl = vi.fn().mockResolvedValue({
      data: { token: "signed-token", path: "unused", signedUrl: "https://example.test/upload" },
      error: null,
    })
    mocks.createAdminClient.mockReturnValue({
      storage: { from: vi.fn().mockReturnValue({ createSignedUploadUrl }) },
    })

    const result = await prepareScriptCoverUpload(
      scriptId,
      { size: 1024, type: "image/png" },
      reason,
      null,
    )

    expect(result.error).toBeUndefined()
    expect(result.path).toMatch(new RegExp(`^covers/${scriptId}/[0-9a-f-]+\\.png$`))
    expect(result).toMatchObject({
      success: true,
      bucket: "scripts-covers",
      token: "signed-token",
      preparedUpdatedAt: initialUpdatedAt,
    })
    expect(createSignedUploadUrl).toHaveBeenCalledWith(result.path, { upsert: false })
  })

  it("rejects a finalize path owned by another script before touching Storage", async () => {
    const result = await finalizeScriptCoverUpload(
      scriptId,
      "covers/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444.png",
      reason,
      null,
      initialUpdatedAt,
    )

    expect(result).toEqual({ error: "封面上传路径无效" })
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it("revalidates the stored bytes and commits the server-generated public URL with CAS", async () => {
    const objectPath = `covers/${scriptId}/44444444-4444-4444-8444-444444444444.png`
    const publicUrl = `https://wjjhprflldvclulistcx.supabase.co/storage/v1/object/public/scripts-covers/${objectPath}`
    const read = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { cover_url: null, archived_at: null, updated_at: initialUpdatedAt },
        error: null,
      }),
    }
    read.select.mockReturnValue(read)
    read.eq.mockReturnValue(read)
    const write = {
      update: vi.fn(),
      eq: vi.fn(),
      is: vi.fn(),
      select: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: scriptId, updated_at: nextUpdatedAt },
        error: null,
      }),
    }
    write.update.mockReturnValue(write)
    write.eq.mockReturnValue(write)
    write.is.mockReturnValue(write)
    write.select.mockReturnValue(write)
    const from = vi.fn()
      .mockReturnValueOnce(read)
      .mockReturnValueOnce(write)
    mocks.createClient.mockResolvedValue({ from })
    mocks.createAdminClient.mockReturnValue({
      storage: {
        from: vi.fn().mockReturnValue({
          getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl } }),
        }),
      },
    })

    const result = await finalizeScriptCoverUpload(
      scriptId,
      objectPath,
      reason,
      null,
      initialUpdatedAt,
    )

    expect(result).toEqual({ success: true, url: publicUrl, updatedAt: nextUpdatedAt })
    expect(mocks.validateDirectlyUploadedImage).toHaveBeenCalledWith(
      "scripts-covers",
      objectPath,
      5 * 1024 * 1024,
    )
    expect(write.update).toHaveBeenCalledWith({ cover_url: publicUrl, audit_reason: reason })
    expect(write.eq).toHaveBeenCalledWith("updated_at", initialUpdatedAt)
  })

  it("treats a concurrent same-path finalize winner as success without queuing deletion", async () => {
    const objectPath = `covers/${scriptId}/44444444-4444-4444-8444-444444444444.png`
    const publicUrl = `https://wjjhprflldvclulistcx.supabase.co/storage/v1/object/public/scripts-covers/${objectPath}`
    const read = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { cover_url: null, archived_at: null, updated_at: initialUpdatedAt },
        error: null,
      }),
    }
    read.select.mockReturnValue(read)
    read.eq.mockReturnValue(read)
    const losingWrite = {
      update: vi.fn(),
      eq: vi.fn(),
      is: vi.fn(),
      select: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    losingWrite.update.mockReturnValue(losingWrite)
    losingWrite.eq.mockReturnValue(losingWrite)
    losingWrite.is.mockReturnValue(losingWrite)
    losingWrite.select.mockReturnValue(losingWrite)
    const confirm = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { cover_url: publicUrl, updated_at: nextUpdatedAt },
        error: null,
      }),
    }
    confirm.select.mockReturnValue(confirm)
    confirm.eq.mockReturnValue(confirm)
    mocks.createClient.mockResolvedValue({
      from: vi.fn()
        .mockReturnValueOnce(read)
        .mockReturnValueOnce(losingWrite)
        .mockReturnValueOnce(confirm),
    })
    mocks.createAdminClient.mockReturnValue({
      storage: {
        from: vi.fn().mockReturnValue({
          getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl } }),
        }),
      },
    })

    const result = await finalizeScriptCoverUpload(
      scriptId,
      objectPath,
      reason,
      null,
      initialUpdatedAt,
    )

    expect(result).toEqual({ success: true, url: publicUrl, updatedAt: nextUpdatedAt })
    expect(mocks.removeStorageObjectsOrQueue).not.toHaveBeenCalled()
  })
})
