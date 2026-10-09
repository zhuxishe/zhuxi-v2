import { COMMUNITY_MAX_IMAGE_BYTES } from "./constants"

export const COMMUNITY_UPLOAD_STAGING_BUCKET = "community-upload-staging"
export const DIRECT_UPLOAD_JSON_MAX_BYTES = 4096
export type DirectUploadKind = "photo" | "avatar" | "profile-avatar"

export function isDirectUploadKind(value: unknown): value is DirectUploadKind {
  return value === "photo" || value === "avatar" || value === "profile-avatar"
}

export function validateDirectUploadSize(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value)
    && value > 0 && value <= COMMUNITY_MAX_IMAGE_BYTES
}

export function directUploadEndpoint(supabaseUrl: string): string {
  const url = new URL(supabaseUrl)
  // Hosted Storage has its own endpoint; local/custom-domain instances retain
  // their existing origin. No endpoint is accepted from the uploading browser.
  if (/^[a-z0-9]+\.supabase\.co$/.test(url.hostname)) {
    url.hostname = url.hostname.replace(".supabase.co", ".storage.supabase.co")
  }
  url.pathname = "/storage/v1/upload/resumable/sign"
  url.search = ""
  url.hash = ""
  return url.toString()
}

export function directUploadErrorStatus(message: string): number {
  if (message.includes("upload limit")) return 429
  if (message.includes("not found")) return 404
  if (message.includes("expired") || message.includes("cancelled")) return 410
  return 400
}

export function directUploadErrorMessage(message: string): string {
  if (message.includes("upload limit")) return "上传较频繁，请稍后重试"
  if (message.includes("expired") || message.includes("cancelled")) return "上传已失效，请重新选择照片"
  if (message.includes("not found")) return "找不到本次上传，请重试"
  if (/^(仅支持|照片像素过大|无法读取|单张照片不能超过)/.test(message)) return message
  return "照片处理失败，请重试"
}

// A Fluid Compute instance may accept many HTTP requests at once. Admit only
// one image-processing request before downloading its original; other requests
// receive 202 and retry without buffering multiple 20MiB photos in memory.
let directProcessingBusy = false
export function tryClaimDirectImageProcessing(): (() => void) | null {
  if (directProcessingBusy) return null
  directProcessingBusy = true
  let released = false
  return () => {
    if (released) return
    released = true
    directProcessingBusy = false
  }
}
