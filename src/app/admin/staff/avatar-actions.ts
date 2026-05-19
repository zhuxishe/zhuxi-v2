"use server"

import { requireAdmin } from "@/lib/auth/admin"
import { createAdminClient } from "@/lib/supabase/admin"
import { imageExtension, SAFE_IMAGE_TYPES, validateSafeImageFile } from "@/lib/file-validation"

const BUCKET = "staff-avatars"
const MAX_SIZE = 2 * 1024 * 1024

export async function uploadStaffAvatar(formData: FormData) {
  await requireAdmin()
  const file = formData.get("file") as File | null
  if (!file || file.size === 0) return { error: "请选择头像文件" }
  const validation = await validateSafeImageFile(file)
  if (!validation.valid) return { error: validation.error }
  if (file.size > MAX_SIZE) return { error: "头像不能超过 2MB" }

  const supabase = createAdminClient()
  const bucket = await supabase.storage.getBucket(BUCKET)
  if (bucket.error) {
    const created = await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_SIZE,
      allowedMimeTypes: SAFE_IMAGE_TYPES,
    })
    if (created.error) {
      console.error("[createStaffAvatarBucket]", created.error)
      return { error: "头像存储桶创建失败" }
    }
  }

  const ext = imageExtension(file.type)
  if (!ext) return { error: "仅支持 JPG / PNG / WebP" }
  const path = `avatars/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (error) {
    console.error("[uploadStaffAvatar]", error)
    return { error: "头像上传失败" }
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { success: true, url: data.publicUrl }
}
