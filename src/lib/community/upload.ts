import {
  COMMUNITY_MAX_IMAGE_BYTES,
  COMMUNITY_MAX_MULTIPART_BYTES,
} from "./constants"

export const COMMUNITY_IMAGE_SIZE_ERROR = "单张照片不能超过 4MB"

export type CommunityUploadLocale = "zh" | "ja"
export type MultipartLengthError = "missing" | "too_large" | null

export function imageSizeError(locale: CommunityUploadLocale): string {
  return locale === "ja"
    ? "写真は1枚4MB以下のものを選んでください。"
    : "请选择不超过 4MB 的单张照片。"
}

export function validateMultipartLength(value: string | null): MultipartLengthError {
  if (value === null || !/^\d+$/.test(value)) return "missing"
  const length = Number(value)
  if (!Number.isSafeInteger(length) || length <= 0) return "missing"
  return length > COMMUNITY_MAX_MULTIPART_BYTES ? "too_large" : null
}

export function isImageFileTooLarge(file: Pick<File, "size">): boolean {
  return file.size > COMMUNITY_MAX_IMAGE_BYTES
}

export async function readUploadResponse<T extends object>(
  response: Response,
  messages: { fallback: string; payloadTooLarge: string },
): Promise<T & { error?: string }> {
  let payload: Record<string, unknown> = {}

  try {
    const raw = await response.text()
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        payload = parsed as Record<string, unknown>
      }
    }
  } catch {
    // Vercel can return an HTML/plain-text 413 before the route handler runs.
  }

  if (!response.ok && response.status === 413) {
    payload.error = messages.payloadTooLarge
  } else if (!response.ok && typeof payload.error !== "string") {
    payload.error = messages.fallback
  }

  return payload as T & { error?: string }
}
