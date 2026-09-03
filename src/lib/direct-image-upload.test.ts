import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}))

import {
  validateDirectImageUploadMetadata,
  validateDirectlyUploadedImage,
} from "./direct-image-upload"

describe("direct image upload validation", () => {
  beforeEach(() => vi.clearAllMocks())

  it("accepts an image exactly at the configured byte limit", () => {
    expect(validateDirectImageUploadMetadata({
      size: 5 * 1024 * 1024,
      type: "image/png",
    }, 5 * 1024 * 1024)).toEqual({
      ok: true,
      size: 5 * 1024 * 1024,
      type: "image/png",
      extension: "png",
    })
  })

  it("rejects oversized, empty, fractional, and unsupported metadata", () => {
    const max = 5 * 1024 * 1024
    expect(validateDirectImageUploadMetadata({ size: max + 1, type: "image/png" }, max).ok).toBe(false)
    expect(validateDirectImageUploadMetadata({ size: 0, type: "image/png" }, max).ok).toBe(false)
    expect(validateDirectImageUploadMetadata({ size: 1.5, type: "image/png" }, max).ok).toBe(false)
    expect(validateDirectImageUploadMetadata({ size: 10, type: "image/svg+xml" }, max).ok).toBe(false)
  })

  it("checks Storage metadata and the uploaded file signature", async () => {
    const png = new Blob([
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
    ], { type: "image/png" })
    const info = vi.fn().mockResolvedValue({
      data: { size: png.size, contentType: "image/png" },
      error: null,
    })
    const download = vi.fn().mockResolvedValue({ data: png, error: null })
    const from = vi.fn().mockReturnValue({ info, download })
    mocks.createAdminClient.mockReturnValue({ storage: { from } })

    await expect(validateDirectlyUploadedImage(
      "scripts-covers",
      "covers/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png",
      5 * 1024 * 1024,
    )).resolves.toEqual({ ok: true, size: png.size, type: "image/png" })
    expect(from).toHaveBeenCalledWith("scripts-covers")
  })

  it("rejects a spoofed image even when Storage reports an allowed MIME type", async () => {
    const body = new Blob([new TextEncoder().encode("not a png")], { type: "image/png" })
    const from = vi.fn().mockReturnValue({
      info: vi.fn().mockResolvedValue({
        data: { size: body.size, contentType: "image/png" },
        error: null,
      }),
      download: vi.fn().mockResolvedValue({ data: body, error: null }),
    })
    mocks.createAdminClient.mockReturnValue({ storage: { from } })

    const result = await validateDirectlyUploadedImage(
      "activity-media",
      "activities/11111111-1111-4111-8111-111111111111/cover/22222222-2222-4222-8222-222222222222.png",
      8 * 1024 * 1024,
    )
    expect(result).toEqual({ ok: false, error: "图片文件内容无效" })
  })

  it("rejects a stored MIME type that does not match the signed path extension", async () => {
    const download = vi.fn()
    const from = vi.fn().mockReturnValue({
      info: vi.fn().mockResolvedValue({
        data: { size: 12, contentType: "image/png" },
        error: null,
      }),
      download,
    })
    mocks.createAdminClient.mockReturnValue({ storage: { from } })

    const result = await validateDirectlyUploadedImage(
      "scripts-covers",
      "covers/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg",
      5 * 1024 * 1024,
    )

    expect(result).toEqual({ ok: false, error: "图片格式与上传路径不一致" })
    expect(download).not.toHaveBeenCalled()
  })
})
