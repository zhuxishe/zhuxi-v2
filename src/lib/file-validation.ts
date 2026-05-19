const IMAGE_SIGNATURES = {
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]],
} as const

export const SAFE_IMAGE_TYPES = Object.keys(IMAGE_SIGNATURES)

export function imageExtension(type: string) {
  if (type === "image/jpeg") return "jpg"
  if (type === "image/png") return "png"
  if (type === "image/webp") return "webp"
  return null
}

function startsWithBytes(bytes: Uint8Array, signature: readonly number[]) {
  return signature.every((byte, index) => bytes[index] === byte)
}

function hasValidImageSignature(type: string, bytes: Uint8Array) {
  const signatures = IMAGE_SIGNATURES[type as keyof typeof IMAGE_SIGNATURES]
  if (!signatures?.some((signature) => startsWithBytes(bytes, signature))) return false
  if (type !== "image/webp") return true
  return String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
}

export async function validateSafeImageFile(file: File) {
  if (!SAFE_IMAGE_TYPES.includes(file.type)) return { valid: false, error: "仅支持 JPG / PNG / WebP" }
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  if (!hasValidImageSignature(file.type, bytes)) return { valid: false, error: "图片文件内容无效" }
  return { valid: true, error: null }
}
