import {
  COMMUNITY_MAX_IMAGE_BYTES,
  COMMUNITY_MAX_IMAGES,
  COMMUNITY_PRESET_AVATARS,
} from "./constants"
import type { CommunityActionState, UploadedCommunityImage } from "./types"

const RESERVED_NICKNAMES = /^(admin|administrator|staff|官方|管理员|竹溪社官方|管理者|運営|公式)$/i

export function validateNickname(value: string): string | null {
  const nickname = value.normalize("NFKC").trim()
  if ([...nickname].length < 2 || [...nickname].length > 20) return "昵称需要 2–20 个字符"
  if (RESERVED_NICKNAMES.test(nickname)) return "这个昵称由系统保留"
  return null
}

export function validateTreehole(title: string, body: string): CommunityActionState | null {
  const fieldErrors: Record<string, string> = {}
  if (title.trim().length > 60) fieldErrors.title = "标题不能超过 60 个字符"
  if (!body.trim()) fieldErrors.body = "请写下想分享的内容"
  if (body.trim().length > 2000) fieldErrors.body = "正文不能超过 2,000 个字符"
  return Object.keys(fieldErrors).length ? { error: "请检查输入内容", fieldErrors } : null
}

export function validateComment(body: string): string | null {
  const value = body.trim()
  if (!value) return "评论不能为空"
  if (value.length > 500) return "评论不能超过 500 个字符"
  return null
}

export function validatePhotoPost(body: string, images: UploadedCommunityImage[]): string | null {
  if (body.length > 500) return "照片说明不能超过 500 个字符"
  if (images.length < 1 || images.length > COMMUNITY_MAX_IMAGES) return "请选择 1–9 张照片"
  if (images.some((image) => image.byteSize > COMMUNITY_MAX_IMAGE_BYTES)) return "单张照片不能超过 15MB"
  return null
}

export function isPresetAvatar(value: string): value is (typeof COMMUNITY_PRESET_AVATARS)[number] {
  return COMMUNITY_PRESET_AVATARS.includes(value as (typeof COMMUNITY_PRESET_AVATARS)[number])
}
