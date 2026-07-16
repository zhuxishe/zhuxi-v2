import { describe, expect, it } from "vitest"
import {
  assertCommunityPixelLimit,
  assertHeicPixelLimit,
  detectCommunityImageType,
} from "./image-validation"

function heicWithSize(width: number, height: number) {
  const input = Buffer.alloc(36)
  input.writeUInt32BE(20, 12)
  input.write("ispe", 16, "ascii")
  input.writeUInt32BE(width, 24)
  input.writeUInt32BE(height, 28)
  return input
}

describe("community image validation", () => {
  it("detects supported file signatures", () => {
    expect(detectCommunityImageType(Buffer.from([0xff, 0xd8, 0xff]))).toBe("jpeg")
    expect(detectCommunityImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe("png")
    expect(detectCommunityImageType(Buffer.from("RIFF0000WEBP"))).toBe("webp")
    expect(detectCommunityImageType(Buffer.from("0000ftypheic"))).toBe("heic")
  })

  it("rejects images over forty megapixels", () => {
    expect(() => assertCommunityPixelLimit(8000, 5000)).not.toThrow()
    expect(() => assertCommunityPixelLimit(8001, 5000)).toThrow("照片像素过大")
  })

  it("checks HEIC ispe dimensions before decoding", () => {
    expect(() => assertHeicPixelLimit(heicWithSize(8000, 5000))).not.toThrow()
    expect(() => assertHeicPixelLimit(heicWithSize(10000, 5000))).toThrow("照片像素过大")
    expect(() => assertHeicPixelLimit(Buffer.alloc(32))).toThrow("无法读取 HEIC")
  })
})
