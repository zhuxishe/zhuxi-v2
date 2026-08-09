import { describe, expect, it } from "vitest"
import {
  COMMUNITY_MAX_IMAGE_BYTES,
  COMMUNITY_MAX_MULTIPART_BYTES,
} from "./constants"
import {
  imageSizeError,
  isImageFileTooLarge,
  readUploadResponse,
  validateMultipartLength,
} from "./upload"

describe("community upload boundaries", () => {
  it("leaves multipart overhead below Vercel's request-body limit", () => {
    expect(COMMUNITY_MAX_IMAGE_BYTES).toBe(4 * 1024 * 1024)
    expect(COMMUNITY_MAX_MULTIPART_BYTES).toBeGreaterThan(COMMUNITY_MAX_IMAGE_BYTES)
    expect(COMMUNITY_MAX_MULTIPART_BYTES).toBeLessThan(4_500_000)
  })

  it("validates declared multipart length before parsing the body", () => {
    expect(validateMultipartLength(null)).toBe("missing")
    expect(validateMultipartLength("unknown")).toBe("missing")
    expect(validateMultipartLength("0")).toBe("missing")
    expect(validateMultipartLength(String(COMMUNITY_MAX_MULTIPART_BYTES))).toBeNull()
    expect(validateMultipartLength(String(COMMUNITY_MAX_MULTIPART_BYTES + 1))).toBe("too_large")
  })

  it("accepts a 4 MiB image and rejects anything larger", () => {
    expect(isImageFileTooLarge({ size: COMMUNITY_MAX_IMAGE_BYTES })).toBe(false)
    expect(isImageFileTooLarge({ size: COMMUNITY_MAX_IMAGE_BYTES + 1 })).toBe(true)
  })

  it("provides natural Chinese and Japanese selection messages", () => {
    expect(imageSizeError("zh")).toContain("4MB")
    expect(imageSizeError("ja")).toContain("4MB以下")
  })
})

describe("upload response parsing", () => {
  const messages = {
    fallback: "上传失败",
    payloadTooLarge: "请选择不超过 4MB 的照片。",
  }

  it("handles a platform HTML 413 without throwing a JSON syntax error", async () => {
    const response = new Response("<h1>FUNCTION_PAYLOAD_TOO_LARGE</h1>", {
      status: 413,
      headers: { "content-type": "text/html" },
    })

    await expect(readUploadResponse(response, messages)).resolves.toEqual({
      error: messages.payloadTooLarge,
    })
  })

  it("localizes a route JSON 413 and preserves other API errors", async () => {
    const tooLarge = new Response(JSON.stringify({ error: "单张照片不能超过 4MB" }), {
      status: 413,
      headers: { "content-type": "application/json" },
    })
    const forbidden = new Response(JSON.stringify({ error: "只有正式会员可以使用社区" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    })

    await expect(readUploadResponse(tooLarge, messages)).resolves.toMatchObject({
      error: messages.payloadTooLarge,
    })
    await expect(readUploadResponse(forbidden, messages)).resolves.toMatchObject({
      error: "只有正式会员可以使用社区",
    })
  })

  it("returns a successful JSON payload", async () => {
    const response = Response.json({ storagePath: "user/photos/a.webp" })
    await expect(readUploadResponse<{ storagePath: string }>(response, messages)).resolves.toEqual({
      storagePath: "user/photos/a.webp",
    })
  })
})
