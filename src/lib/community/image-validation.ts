import { COMMUNITY_MAX_IMAGE_PIXELS } from "./constants"

export type CommunityImageInputType = "jpeg" | "png" | "webp" | "heic"

export function detectCommunityImageType(bytes: Uint8Array): CommunityImageInputType | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg"
  if (bytes[0] === 0x89 && Buffer.from(bytes.slice(1, 4)).toString("ascii") === "PNG") return "png"
  if (Buffer.from(bytes.slice(0, 4)).toString("ascii") === "RIFF"
      && Buffer.from(bytes.slice(8, 12)).toString("ascii") === "WEBP") return "webp"
  const brand = Buffer.from(bytes.slice(4, 12)).toString("ascii")
  if (brand.startsWith("ftyp") && /heic|heix|hevc|hevx|mif1|msf1/.test(brand)) return "heic"
  return null
}

export function assertCommunityPixelLimit(width: number | undefined, height: number | undefined) {
  if (!width || !height || width <= 0 || height <= 0) {
    throw new Error("无法读取照片尺寸")
  }
  if (width * height > COMMUNITY_MAX_IMAGE_PIXELS) {
    throw new Error("照片像素过大，请选择较小的照片")
  }
}

export function assertHeicPixelLimit(input: Buffer) {
  let offset = 0
  let found = false
  let maxPixels = 0
  while (offset >= 0 && offset < input.length - 16) {
    offset = input.indexOf("ispe", offset, "ascii")
    if (offset < 0) break
    const declaredSize = offset >= 4 ? input.readUInt32BE(offset - 4) : 0
    if (declaredSize >= 20 && offset + 16 <= input.length) {
      const width = input.readUInt32BE(offset + 8)
      const height = input.readUInt32BE(offset + 12)
      if (width > 0 && height > 0) {
        found = true
        maxPixels = Math.max(maxPixels, width * height)
      }
    }
    offset += 4
  }
  if (!found) throw new Error("无法读取 HEIC 照片尺寸")
  if (maxPixels > COMMUNITY_MAX_IMAGE_PIXELS) {
    throw new Error("照片像素过大，请选择较小的照片")
  }
}
