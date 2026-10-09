import { describe, expect, it } from "vitest"
import {
  assertCommunityPixelLimit,
  assertHeicPixelLimit,
  detectCommunityImageType,
} from "./image-validation"

function box(type: string, ...contents: Buffer[]) {
  const content = Buffer.concat(contents)
  const header = Buffer.alloc(8)
  header.writeUInt32BE(content.length + 8)
  header.write(type, 4, "ascii")
  return Buffer.concat([header, content])
}

function fileType(major = "heic", compatible = ["mif1", "heic"]) {
  return box("ftyp", Buffer.from(major), Buffer.alloc(4), Buffer.from(compatible.join("")))
}

function properties(width: number, height: number) {
  const dimensions = Buffer.alloc(12)
  dimensions.writeUInt32BE(width, 4)
  dimensions.writeUInt32BE(height, 8)
  return box("meta", Buffer.alloc(4), box("iprp", box("ipco", box("ispe", dimensions))))
}

function heicWithSize(width: number, height: number) {
  return Buffer.concat([fileType(), properties(width, height)])
}

describe("community image validation", () => {
  it("detects complete supported signatures and HEIC compatible brands", () => {
    expect(detectCommunityImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg")
    expect(detectCommunityImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("png")
    const webp = Buffer.from("RIFF0000WEBPVP8 0000")
    webp.writeUInt32LE(webp.length - 8, 4)
    expect(detectCommunityImageType(webp)).toBe("webp")
    expect(detectCommunityImageType(fileType())).toBe("heic")
    expect(detectCommunityImageType(fileType("mif1", ["mif1", "heix"])) ).toBe("heic")
  })

  it("rejects ambiguous HEIF/AVIF, RAW, forged and truncated signatures", () => {
    for (const input of [
      fileType("mif1", ["mif1", "avif"]),
      Buffer.from("II*\0RAW"),
      Buffer.from("0000ftypheic"),
      fileType().subarray(0, 20),
      Buffer.from([0xff, 0xd8, 0xff]),
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      Buffer.from("RIFF0000WEBP"),
    ]) {
      expect(detectCommunityImageType(input)).toBeNull()
    }
  })

  it("accepts 48 megapixels and the 60 megapixel boundary", () => {
    expect(() => assertCommunityPixelLimit(8064, 6048)).not.toThrow()
    expect(() => assertCommunityPixelLimit(10000, 6000)).not.toThrow()
    expect(() => assertCommunityPixelLimit(10001, 6000)).toThrow("照片像素过大")
    expect(() => assertCommunityPixelLimit(Infinity, 1)).toThrow("无法读取")
    expect(() => assertCommunityPixelLimit(0, 6000)).toThrow("无法读取")
  })

  it("checks HEIC item dimensions before decoding", () => {
    expect(() => assertHeicPixelLimit(heicWithSize(8064, 6048))).not.toThrow()
    expect(() => assertHeicPixelLimit(heicWithSize(10000, 6000))).not.toThrow()
    expect(() => assertHeicPixelLimit(heicWithSize(10001, 6000))).toThrow("照片像素过大")
  })

  it("rejects payload ispe strings, truncated boxes and forged safe dimensions", () => {
    const payloadIspe = Buffer.concat([fileType(), box("mdat", properties(100, 100))])
    expect(() => assertHeicPixelLimit(payloadIspe)).toThrow("无法读取 HEIC")
    expect(() => assertHeicPixelLimit(heicWithSize(100, 100).subarray(0, -1))).toThrow("无法读取 HEIC")
    expect(() => assertHeicPixelLimit(Buffer.alloc(32))).toThrow("无法读取 HEIC")
    expect(() => assertHeicPixelLimit(Buffer.concat([
      fileType(), properties(100, 100), properties(10001, 6000),
    ]))).toThrow("照片像素过大")
  })
})
