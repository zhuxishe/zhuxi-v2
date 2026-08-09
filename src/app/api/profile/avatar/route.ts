import { randomUUID } from "node:crypto"
import convertHeic from "heic-convert"
import sharp from "sharp"
import { NextResponse, type NextRequest } from "next/server"
import { getPlayerInfo } from "@/lib/auth/player"
import {
  COMMUNITY_AVATAR_BUCKET,
  COMMUNITY_MAX_IMAGE_PIXELS,
} from "@/lib/community/constants"
import {
  assertCommunityPixelLimit,
  assertHeicPixelLimit,
  detectCommunityImageType,
} from "@/lib/community/image-validation"
import {
  COMMUNITY_IMAGE_SIZE_ERROR,
  isImageFileTooLarge,
  validateMultipartLength,
} from "@/lib/community/upload"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

async function normalizeAvatar(input: Buffer) {
  const signature = detectCommunityImageType(input.subarray(0, 16))
  if (!signature) throw new Error("仅支持 JPG、PNG、WebP 或 HEIC 照片")

  if (signature === "heic") {
    assertHeicPixelLimit(input)
  } else {
    try {
      const metadata = await sharp(input, {
        failOn: "warning",
        limitInputPixels: COMMUNITY_MAX_IMAGE_PIXELS,
      }).metadata()
      assertCommunityPixelLimit(metadata.width, metadata.height)
    } catch (error) {
      if (error instanceof Error && /pixel limit|Input image exceeds/i.test(error.message)) {
        throw new Error("照片像素过大，请选择较小的照片")
      }
      throw error
    }
  }

  const decoded = signature === "heic"
    ? Buffer.from(await convertHeic({ buffer: input, format: "JPEG", quality: 0.9 }))
    : input

  return sharp(decoded, {
    failOn: "warning",
    limitInputPixels: COMMUNITY_MAX_IMAGE_PIXELS,
  })
    .rotate()
    .resize(512, 512, { fit: "cover", position: "attention", withoutEnlargement: false })
    .webp({ quality: 84 })
    .toBuffer({ resolveWithObject: true })
}

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
    return NextResponse.json({ error: COMMUNITY_IMAGE_SIZE_ERROR }, { status: 413 })
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
  if (isImageFileTooLarge(file)) {
    return NextResponse.json({ error: COMMUNITY_IMAGE_SIZE_ERROR }, { status: 413 })
  }

  let uploadedPath: string | null = null
  try {
    const admin = createAdminClient()
    const processed = await normalizeAvatar(Buffer.from(await file.arrayBuffer()))
    uploadedPath = `${user.id}/avatars/profile-${randomUUID()}.webp`

    const upload = await admin.storage
      .from(COMMUNITY_AVATAR_BUCKET)
      .upload(uploadedPath, processed.data, {
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
      p_width: processed.info.width,
      p_height: processed.info.height,
      p_byte_size: processed.data.byteLength,
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
