import { createAdminClient } from "@/lib/supabase/admin"
import {
  SAFE_IMAGE_TYPES,
  hasValidImageSignature,
  imageExtension,
} from "@/lib/file-validation"

export interface DirectImageUploadMetadata {
  size: number
  type: string
}

export function validateDirectImageUploadMetadata(
  value: unknown,
  maxBytes: number,
) {
  if (!value || typeof value !== "object") {
    return { ok: false as const, error: "图片信息无效" }
  }
  const metadata = value as Partial<DirectImageUploadMetadata>
  if (!Number.isSafeInteger(metadata.size) || (metadata.size ?? 0) < 1) {
    return { ok: false as const, error: "图片大小无效" }
  }
  if ((metadata.size ?? 0) > maxBytes) {
    return { ok: false as const, error: `图片不能超过 ${Math.floor(maxBytes / 1024 / 1024)}MB` }
  }
  if (typeof metadata.type !== "string" || !SAFE_IMAGE_TYPES.includes(metadata.type)) {
    return { ok: false as const, error: "仅支持 JPG / PNG / WebP" }
  }
  const extension = imageExtension(metadata.type)
  if (!extension) return { ok: false as const, error: "仅支持 JPG / PNG / WebP" }
  return {
    ok: true as const,
    size: metadata.size as number,
    type: metadata.type,
    extension,
  }
}

/**
 * Re-check the object after a signed browser upload. Client metadata is only
 * used for early feedback; this server-side inspection is authoritative.
 */
export async function validateDirectlyUploadedImage(
  bucketId: "scripts-covers" | "activity-media",
  objectPath: string,
  maxBytes: number,
) {
  const storage = createAdminClient().storage.from(bucketId)
  const { data: info, error: infoError } = await storage.info(objectPath)
  if (infoError || !info) return { ok: false as const, error: "读取已上传图片失败" }

  const size = info.size
  const type = info.contentType
  if (!Number.isSafeInteger(size) || (size ?? 0) < 1 || (size ?? 0) > maxBytes) {
    return { ok: false as const, error: `图片不能超过 ${Math.floor(maxBytes / 1024 / 1024)}MB` }
  }
  if (typeof type !== "string" || !SAFE_IMAGE_TYPES.includes(type)) {
    return { ok: false as const, error: "仅支持 JPG / PNG / WebP" }
  }
  const expectedExtension = imageExtension(type)
  if (!expectedExtension || !objectPath.endsWith(`.${expectedExtension}`)) {
    return { ok: false as const, error: "图片格式与上传路径不一致" }
  }
  const { data: blob, error: downloadError } = await storage.download(objectPath)
  if (downloadError || !blob) return { ok: false as const, error: "校验已上传图片失败" }
  if (blob.size !== size) return { ok: false as const, error: "图片大小校验失败" }

  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
  if (!hasValidImageSignature(type, bytes)) {
    return { ok: false as const, error: "图片文件内容无效" }
  }
  return { ok: true as const, size, type }
}
