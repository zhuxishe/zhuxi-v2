import { randomUUID } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"
import { getPlayerInfo } from "@/lib/auth/player"
import { getCommunityContext } from "@/lib/auth/community"
import {
  COMMUNITY_AVATAR_BUCKET,
  COMMUNITY_MAX_LEGACY_IMAGE_BYTES,
  COMMUNITY_MEDIA_BUCKET,
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 })

  const player = await getPlayerInfo()
  if (!player || player.status !== "approved") {
    return NextResponse.json({ error: "只有正式会员可以使用社区" }, { status: 403 })
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
  const kind = formData.get("kind") === "avatar" ? "avatar" : "photo"
  if (!(file instanceof File)) return NextResponse.json({ error: "请选择照片" }, { status: 400 })
  if (file.size <= 0) return NextResponse.json({ error: "请选择照片" }, { status: 400 })
  if (file.size > COMMUNITY_MAX_LEGACY_IMAGE_BYTES) {
    return NextResponse.json({ error: LEGACY_UPLOAD_SIZE_ERROR }, { status: 413 })
  }

  const context = await getCommunityContext(player)
  if (context.restriction?.type === "permanent_ban") {
    return NextResponse.json({ error: "当前账号无法使用社区" }, { status: 403 })
  }
  if (kind === "photo" && !context.canWrite) {
    return NextResponse.json({ error: "当前账号暂时不能发布照片" }, { status: 403 })
  }

  try {
    const admin = createAdminClient()
    const processed = await normalizeCommunityImage(Buffer.from(await file.arrayBuffer()), kind)
    const id = randomUUID()
    const bucket = kind === "avatar" ? COMMUNITY_AVATAR_BUCKET : COMMUNITY_MEDIA_BUCKET
    const folder = kind === "avatar" ? "avatars" : "photos"
    const mainPath = `${user.id}/${folder}/${id}.webp`
    const thumbnailPath = kind === "avatar" ? mainPath : `${user.id}/${folder}/${id}-thumb.webp`

    const mainUpload = await admin.storage.from(bucket).upload(mainPath, processed.main, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false,
    })
    if (mainUpload.error) throw new Error(mainUpload.error.message)

    if (thumbnailPath !== mainPath) {
      const thumbnailUpload = await admin.storage.from(bucket).upload(thumbnailPath, processed.thumbnail, {
        contentType: "image/webp",
        cacheControl: "31536000",
        upsert: false,
      })
      if (thumbnailUpload.error) {
        await admin.storage.from(bucket).remove([mainPath])
        throw new Error(thumbnailUpload.error.message)
      }
    }

    const { error: registrationError } = await admin.rpc("community_register_processed_upload", {
      p_member_id: player.memberId,
      p_bucket_id: bucket,
      p_storage_path: mainPath,
      p_thumbnail_path: thumbnailPath,
      p_width: processed.width,
      p_height: processed.height,
      p_byte_size: processed.main.byteLength,
      p_mime_type: "image/webp",
    })
    if (registrationError) {
      const uploadedPaths = thumbnailPath === mainPath
        ? [mainPath]
        : [mainPath, thumbnailPath]
      const { error: cleanupError } = await admin.storage.from(bucket).remove(uploadedPaths)
      if (cleanupError) {
        console.error("[community upload cleanup]", cleanupError)
      }
      throw new Error(registrationError.message)
    }

    return NextResponse.json({
      storagePath: mainPath,
      thumbnailPath,
      width: processed.width,
      height: processed.height,
      byteSize: processed.main.byteLength,
      mimeType: "image/webp",
      previewUrl: `/api/community/media?${new URLSearchParams({ bucket, path: thumbnailPath })}`,
    })
  } catch (error) {
    console.error("[community upload]", error)
    const message = error instanceof Error && (
      error.message.startsWith("仅支持")
      || error.message.startsWith("照片像素过大")
      || error.message.startsWith("无法读取")
    ) ? error.message : "照片处理失败，请重试"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
