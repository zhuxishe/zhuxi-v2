import sharp, { type Sharp } from "sharp"
import {
  COMMUNITY_MAX_IMAGE_BYTES,
  COMMUNITY_MAX_IMAGE_PIXELS,
  COMMUNITY_MAX_PROCESSED_IMAGE_BYTES,
} from "./constants"
import {
  assertCommunityPixelLimit,
  assertHeicPixelLimit,
  detectCommunityImageType,
} from "./image-validation"
import { COMMUNITY_IMAGE_SIZE_ERROR, COMMUNITY_PROCESSED_IMAGE_SIZE_ERROR } from "./upload"

export type CommunityImageKind = "photo" | "avatar"
export type NormalizedCommunityImage = {
  main: Buffer
  thumbnail: Buffer
  width: number
  height: number
}

async function imagePipeline(input: Buffer): Promise<Sharp> {
  const signature = detectCommunityImageType(input)
  if (!signature) throw new Error("仅支持 JPG、PNG、WebP 或 HEIC/HEIF 照片")

  if (signature === "heic") {
    assertHeicPixelLimit(input)
    const { default: decodeHeic } = await import("heic-decode")
    const images = await decodeHeic.all({ buffer: input })
    try {
      const image = images[0]
      if (!image) throw new Error("无法读取 HEIC 照片")
      // Check libheif's actual dimensions before it allocates the full RGBA image,
      // in addition to checking the file's declared item properties above.
      assertCommunityPixelLimit(image.width, image.height)
      const decoded = await image.decode()
      assertCommunityPixelLimit(decoded.width, decoded.height)
      if (decoded.data.byteLength !== decoded.width * decoded.height * 4) {
        throw new Error("无法读取 HEIC 照片")
      }
      // libheif applies HEIF item transforms (irot/imir) while rendering. Raw RGBA
      // avoids a full-size JPEG encode/decode and carries no GPS/EXIF metadata.
      return sharp(Buffer.from(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength), {
        raw: { width: decoded.width, height: decoded.height, channels: 4 },
        limitInputPixels: COMMUNITY_MAX_IMAGE_PIXELS,
      })
    } finally {
      images.dispose()
    }
  }

  const pipeline = sharp(input, { failOn: "warning", limitInputPixels: COMMUNITY_MAX_IMAGE_PIXELS })
  const metadata = await pipeline.metadata()
  assertCommunityPixelLimit(metadata.width, metadata.height)
  if (metadata.format !== signature) throw new Error("照片格式无法读取，请重新选择")
  // Sharp auto-orients using EXIF and strips metadata unless keepMetadata is used.
  return pipeline.rotate().toColourspace("srgb")
}

async function normalizeImage(
  input: Buffer,
  kind: CommunityImageKind,
): Promise<NormalizedCommunityImage> {
  try {
    const base = await imagePipeline(input)
    const attempts = kind === "avatar"
      ? [{ edge: 512, quality: 84 }]
      : [
        { edge: 2400, quality: 84 },
        { edge: 2400, quality: 72 },
        { edge: 1920, quality: 68 },
        { edge: 1440, quality: 68 },
      ]

    for (const { edge, quality } of attempts) {
      const output = await base.clone()
        .resize(edge, edge, kind === "avatar"
          ? { fit: "cover", position: "attention", withoutEnlargement: false }
          : { fit: "inside", withoutEnlargement: true })
        .webp({ quality, effort: 4 })
        .toBuffer({ resolveWithObject: true })
      if (output.data.length > COMMUNITY_MAX_PROCESSED_IMAGE_BYTES) continue
      const thumbnail = kind === "avatar"
        ? output.data
        : await sharp(output.data)
          .resize(720, 720, { fit: "cover", position: "attention" })
          .webp({ quality: 78, effort: 4 })
          .toBuffer()
      return { main: output.data, thumbnail, width: output.info.width, height: output.info.height }
    }
    throw new Error(COMMUNITY_PROCESSED_IMAGE_SIZE_ERROR)
  } catch (error) {
    if (error instanceof Error && /pixel limit|Input image exceeds/i.test(error.message)) {
      throw new Error("照片像素过大，请选择较小的照片")
    }
    throw error
  }
}

// A 48 MP HEIC needs roughly 1 GB while libheif renders RGBA. Serialize this
// memory-heavy stage within each server process; file selection and direct
// uploads remain parallel, and non-HEIC images do not wait for this queue.
let heicProcessing: Promise<void> = Promise.resolve()

export async function normalizeCommunityImage(
  input: Buffer,
  kind: CommunityImageKind,
): Promise<NormalizedCommunityImage> {
  if (input.length === 0) throw new Error("请选择照片")
  if (input.length > COMMUNITY_MAX_IMAGE_BYTES) throw new Error(COMMUNITY_IMAGE_SIZE_ERROR)
  if (detectCommunityImageType(input) !== "heic") return normalizeImage(input, kind)

  const processing = heicProcessing.then(() => normalizeImage(input, kind))
  heicProcessing = processing.then(() => undefined, () => undefined)
  return processing
}
