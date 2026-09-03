import { createHash } from "node:crypto"
import sharp from "sharp"
import { SAFE_IMAGE_TYPES, hasValidImageSignature, imageExtension } from "@/lib/file-validation"
import {
  legacyCoverDestinationPath,
  type LegacyScriptCoverCandidate,
  MAX_LEGACY_COVER_SOURCE_BYTES,
  MAX_SCRIPT_COVER_BYTES,
  SCRIPT_COVER_BUCKET,
} from "@/lib/legacy-script-cover"
import { createAdminClient } from "@/lib/supabase/admin"

interface StoredImage {
  bytes: Buffer
  size: number
  type: string
  extension: "jpg" | "png" | "webp"
}

export async function materializeLegacyScriptCover(candidate: LegacyScriptCoverCandidate) {
  const admin = createAdminClient()
  const source = await readStoredImage("scripts", candidate.sourcePath, MAX_LEGACY_COVER_SOURCE_BYTES)
  const compressed = source.size > MAX_SCRIPT_COVER_BYTES
  const output = compressed ? await compressCover(source.bytes) : source
  const destinationPath = legacyCoverDestinationPath(candidate, output.extension)
  const destination = admin.storage.from(SCRIPT_COVER_BUCKET)

  const writeResult = compressed
    ? await destination.upload(destinationPath, output.bytes, {
        cacheControl: "31536000",
        contentType: output.type,
        upsert: false,
      })
    : await admin.storage.from("scripts").copy(candidate.sourcePath, destinationPath, {
        destinationBucket: SCRIPT_COVER_BUCKET,
      })

  const verified = await readStoredImage(SCRIPT_COVER_BUCKET, destinationPath, MAX_SCRIPT_COVER_BYTES)
  if (verified.type !== output.type || contentHash(verified.bytes) !== contentHash(output.bytes)) {
    throw new Error("LEGACY_SCRIPT_COVER_DESTINATION_MISMATCH")
  }
  const { data } = destination.getPublicUrl(destinationPath)
  return {
    publicUrl: data.publicUrl,
    destinationPath,
    compressed,
    reused: Boolean(writeResult.error),
  }
}

async function readStoredImage(bucket: string, path: string, maxBytes: number): Promise<StoredImage> {
  const storage = createAdminClient().storage.from(bucket)
  const { data: info, error: infoError } = await storage.info(path)
  const type = info?.contentType
  const size = info?.size
  if (
    infoError
    || !Number.isSafeInteger(size)
    || (size ?? 0) < 1
    || (size ?? 0) > maxBytes
    || typeof type !== "string"
    || !SAFE_IMAGE_TYPES.includes(type)
  ) throw new Error("LEGACY_SCRIPT_COVER_METADATA_INVALID")
  const extension = imageExtension(type)
  if (!extension || !path.toLowerCase().endsWith(`.${extension}`)) {
    throw new Error("LEGACY_SCRIPT_COVER_EXTENSION_MISMATCH")
  }
  const { data: blob, error } = await storage.download(path)
  if (error || !blob) throw new Error("LEGACY_SCRIPT_COVER_DOWNLOAD_FAILED")
  const bytes = Buffer.from(await blob.arrayBuffer())
  if (bytes.byteLength !== size || !hasValidImageSignature(type, bytes.subarray(0, 12))) {
    throw new Error("LEGACY_SCRIPT_COVER_CONTENT_INVALID")
  }
  return { bytes, size, type, extension }
}

async function compressCover(input: Buffer): Promise<StoredImage> {
  for (const quality of [86, 76, 66]) {
    const result = await sharp(input, {
      failOn: "warning",
      limitInputPixels: 50_000_000,
    }).rotate().webp({ quality, effort: 4 }).toBuffer({ resolveWithObject: true })
    if (result.data.byteLength <= MAX_SCRIPT_COVER_BYTES) {
      return {
        bytes: result.data,
        size: result.data.byteLength,
        type: "image/webp",
        extension: "webp",
      }
    }
  }
  throw new Error("LEGACY_SCRIPT_COVER_COMPRESSION_TOO_LARGE")
}

function contentHash(value: Buffer) {
  return createHash("sha256").update(value).digest("hex")
}
