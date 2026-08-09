import { randomUUID } from "node:crypto"
import convertHeic from "heic-convert"
import sharp from "sharp"
import { NextResponse, type NextRequest } from "next/server"
import { getPlayerInfo } from "@/lib/auth/player"
import { getCommunityContext } from "@/lib/auth/community"
import {
  COMMUNITY_AVATAR_BUCKET,
  COMMUNITY_MAX_IMAGE_PIXELS,
  COMMUNITY_MEDIA_BUCKET,
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

type UploadKind = "photo" | "avatar"

async function normalizeImage(input: Buffer, kind: UploadKind) {
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

  const base = sharp(decoded, {
    failOn: "warning",
    limitInputPixels: COMMUNITY_MAX_IMAGE_PIXELS,
  }).rotate()
  if (kind === "avatar") {
    const output = await base
      .resize(512, 512, { fit: "cover", position: "attention", withoutEnlargement: false })
      .webp({ quality: 84 })
      .toBuffer({ resolveWithObject: true })
    return { main: output.data, thumbnail: output.data, width: output.info.width, height: output.info.height }
  }

  const output = await base
    .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 84, effort: 4 })
    .toBuffer({ resolveWithObject: true })
  const thumbnail = await sharp(output.data)
    .resize(720, 720, { fit: "cover", position: "attention" })
    .webp({ quality: 78, effort: 4 })
    .toBuffer()
  return { main: output.data, thumbnail, width: output.info.width, height: output.info.height }
}

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
    return NextResponse.json({ error: COMMUNITY_IMAGE_SIZE_ERROR }, { status: 413 })
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
  if (isImageFileTooLarge(file)) {
    return NextResponse.json({ error: COMMUNITY_IMAGE_SIZE_ERROR }, { status: 413 })
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
    const processed = await normalizeImage(Buffer.from(await file.arrayBuffer()), kind)
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
