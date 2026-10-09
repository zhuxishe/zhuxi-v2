import { COMMUNITY_MAX_IMAGE_PIXELS } from "./constants"

export type CommunityImageInputType = "jpeg" | "png" | "webp" | "heic"

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx"])
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const HEIC_DIMENSION_ERROR = "无法读取 HEIC 照片尺寸"

type Box = { type: string; contentStart: number; end: number }

function readBox(input: Buffer, offset: number, end: number): Box {
  if (end - offset < 8) throw new Error(HEIC_DIMENSION_ERROR)
  let size = input.readUInt32BE(offset)
  let headerSize = 8
  if (size === 1) {
    if (end - offset < 16) throw new Error(HEIC_DIMENSION_ERROR)
    const extendedSize = input.readBigUInt64BE(offset + 8)
    if (extendedSize > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(HEIC_DIMENSION_ERROR)
    size = Number(extendedSize)
    headerSize = 16
  } else if (size === 0) {
    size = end - offset
  }
  if (size < headerSize || size > end - offset) throw new Error(HEIC_DIMENSION_ERROR)
  return {
    type: input.toString("ascii", offset + 4, offset + 8),
    contentStart: offset + headerSize,
    end: offset + size,
  }
}

export function detectCommunityImageType(bytes: Uint8Array): CommunityImageInputType | null {
  const input = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (input.length >= 4 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff) return "jpeg"
  if (input.length >= 8 && input.subarray(0, 8).equals(PNG_SIGNATURE)) return "png"
  if (input.length >= 20 && input.toString("ascii", 0, 4) === "RIFF"
      && input.toString("ascii", 8, 12) === "WEBP"
      && ["VP8 ", "VP8L", "VP8X"].includes(input.toString("ascii", 12, 16))
      && input.readUInt32LE(4) + 8 === input.length) return "webp"

  // HEIF's generic mif1 brand is also used by AVIF. Require a HEVC image brand,
  // including compatible brands, instead of trusting an extension or "mif1" alone.
  try {
    const box = readBox(input, 0, input.length)
    if (box.type !== "ftyp" || box.end - box.contentStart < 8
        || (box.end - box.contentStart) % 4 !== 0) return null
    const brands = [input.toString("ascii", box.contentStart, box.contentStart + 4)]
    for (let offset = box.contentStart + 8; offset < box.end; offset += 4) {
      brands.push(input.toString("ascii", offset, offset + 4))
    }
    return brands.some((brand) => HEIC_BRANDS.has(brand)) ? "heic" : null
  } catch {
    return null
  }
}

export function assertCommunityPixelLimit(width: number | undefined, height: number | undefined) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || !width || !height
      || width <= 0 || height <= 0) {
    throw new Error("无法读取照片尺寸")
  }
  if (width > COMMUNITY_MAX_IMAGE_PIXELS / height) {
    throw new Error("照片像素过大，请选择较小的照片")
  }
}

export function assertHeicPixelLimit(input: Buffer) {
  let found = false
  let boxCount = 0

  function visit(start: number, end: number, parent: "file" | "meta" | "iprp" | "ipco") {
    let offset = start
    while (offset < end) {
      if (++boxCount > 4096) throw new Error(HEIC_DIMENSION_ERROR)
      const box = readBox(input, offset, end)
      if (parent === "file" && box.type === "meta") {
        if (box.end - box.contentStart < 4 || input.readUInt32BE(box.contentStart) !== 0) {
          throw new Error(HEIC_DIMENSION_ERROR)
        }
        visit(box.contentStart + 4, box.end, "meta")
      } else if (parent === "meta" && box.type === "iprp") {
        visit(box.contentStart, box.end, "iprp")
      } else if (parent === "iprp" && box.type === "ipco") {
        visit(box.contentStart, box.end, "ipco")
      } else if (parent === "ipco" && box.type === "ispe") {
        if (box.end - box.contentStart !== 12 || input.readUInt32BE(box.contentStart) !== 0) {
          throw new Error(HEIC_DIMENSION_ERROR)
        }
        assertCommunityPixelLimit(input.readUInt32BE(box.contentStart + 4), input.readUInt32BE(box.contentStart + 8))
        found = true
      }
      offset = box.end
    }
  }

  // Traverse real item properties only. Searching arbitrary bytes for "ispe"
  // could mistake image payloads or forged/truncated boxes for safe dimensions.
  visit(0, input.length, "file")
  if (!found) throw new Error(HEIC_DIMENSION_ERROR)
}
