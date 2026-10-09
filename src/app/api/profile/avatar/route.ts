import { randomUUID } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"
import { getPlayerInfo } from "@/lib/auth/player"
import {
  COMMUNITY_AVATAR_BUCKET,
  COMMUNITY_MAX_LEGACY_IMAGE_BYTES,
} from "@/lib/community/constants"
import { normalizeCommunityImage } from "@/lib/community/normalize-image"
import {
  validateMultipartLength,
} from "@/lib/community/upload"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const LEGACY_UPLOAD_SIZE_ERROR = "此页面的上传方式仅支持 4MB，请刷新页面后上传更大的照片"

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const [{ data: { user } }, player] = await Promise.all([
    supabase.auth.getUser(),
    getPlayerInfo(),
  ])
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 })
  if (!player || player.status !== "approved") {
    return NextResponse.json({ error: "只有正式会员可以设置头像" }, { status: 403 })
  }

  const lengthError = validateMultipartLength(request.headers.get("content-length"))
  if (lengthError === "missing") {
    return NextResponse.json({ error: "无法确认上传大小" }, { status: 411 })
  }
  if (lengthError === "too_large") {
    return NextResponse.json({ error: LEGACY_UPLOAD_SIZE_ERROR }, { status: 413 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: "上传内容无法读取" }, { status: 400 })
  }
  const file = formData.get("file")
  if (!(file instanceof File)) return NextResponse.json({ error: "请选择照片" }, { status: 400 })
  if (file.size <= 0) return NextResponse.json({ error: "请选择照片" }, { status: 400 })
  if (file.size > COMMUNITY_MAX_LEGACY_IMAGE_BYTES) {
    return NextResponse.json({ error: LEGACY_UPLOAD_SIZE_ERROR }, { status: 413 })
  }

  let uploadedPath: string | null = null
  try {
    const admin = createAdminClient()
    const processed = await normalizeCommunityImage(Buffer.from(await file.arrayBuffer()), "avatar")
    uploadedPath = `${user.id}/avatars/profile-${randomUUID()}.webp`

    const upload = await admin.storage
      .from(COMMUNITY_AVATAR_BUCKET)
      .upload(uploadedPath, processed.main, {
        contentType: "image/webp",
        cacheControl: "31536000",
        upsert: false,
      })
    if (upload.error) throw new Error(upload.error.message)

    const registration = await admin.rpc("community_register_processed_upload", {
      p_member_id: player.memberId,
      p_bucket_id: COMMUNITY_AVATAR_BUCKET,
      p_storage_path: uploadedPath,
      p_thumbnail_path: uploadedPath,
      p_width: processed.width,
      p_height: processed.height,
      p_byte_size: processed.main.byteLength,
      p_mime_type: "image/webp",
    })
    if (registration.error) {
      throw new Error(registration.error.message)
    }

    const params = new URLSearchParams({ bucket: COMMUNITY_AVATAR_BUCKET, path: uploadedPath })
    return NextResponse.json({
      storagePath: uploadedPath,
      previewUrl: `/api/community/media?${params.toString()}`,
    })
  } catch (error) {
    if (uploadedPath) {
      const admin = createAdminClient()
      const cleanup = await admin.storage.from(COMMUNITY_AVATAR_BUCKET).remove([uploadedPath])
      if (cleanup.error) {
        console.error("[profile avatar cleanup] immediate removal failed", cleanup.error)
        const queued = await admin.rpc("profile_service_queue_avatar_cleanup", {
          p_object_path: uploadedPath,
          p_reason: "profile_avatar_registration_failed",
        })
        if (queued.error) console.error("[profile avatar cleanup] queue fallback failed", queued.error)
      }
    }
    console.error("[profile avatar upload]", error)
    const isInputError = error instanceof Error && (
      error.message.startsWith("仅支持")
      || error.message.startsWith("照片像素过大")
      || error.message.startsWith("无法读取")
    )
    const message = isInputError && error instanceof Error
      ? error.message
      : "头像暂时无法保存，请稍后重试"
    return NextResponse.json({ error: message }, { status: isInputError ? 400 : 500 })
  }
}
