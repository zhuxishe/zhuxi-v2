import { NextResponse, type NextRequest } from "next/server"
import { getPlayerInfo } from "@/lib/auth/player"
import { getCommunityContext } from "@/lib/auth/community"
import { COMMUNITY_AVATAR_BUCKET, COMMUNITY_MEDIA_BUCKET } from "@/lib/community/constants"
import {
  COMMUNITY_UPLOAD_STAGING_BUCKET,
  DIRECT_UPLOAD_JSON_MAX_BYTES,
  directUploadEndpoint,
  directUploadErrorMessage,
  directUploadErrorStatus,
  isDirectUploadKind,
  validateDirectUploadSize,
  tryClaimDirectImageProcessing,
  type DirectUploadKind,
} from "@/lib/community/direct-upload-server"
import { normalizeCommunityImage } from "@/lib/community/normalize-image"
import { COMMUNITY_IMAGE_SIZE_ERROR } from "@/lib/community/upload"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const maxDuration = 120

interface UploadSession {
  id: string
  kind: DirectUploadKind
  expected_size: number
  staging_path: string
  state: "pending" | "processing" | "completed" | "cancelled"
  claim_token: string | null
  storage_path: string | null
  thumbnail_path: string | null
  result: Record<string, unknown> | null
  busy?: boolean
}

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } })
}

async function readSmallJson(request: NextRequest): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new Error("Invalid JSON")
  const reader = request.body?.getReader()
  if (!reader) throw new Error("Invalid JSON")
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > DIRECT_UPLOAD_JSON_MAX_BYTES) {
      await reader.cancel()
      throw new Error("Invalid JSON")
    }
    chunks.push(value)
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"))
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid JSON")
  return value as Record<string, unknown>
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const [{ data: { user } }, player] = await Promise.all([supabase.auth.getUser(), getPlayerInfo()])
  if (!user) return json({ error: "请先登录" }, 401)
  if (!player || player.status !== "approved") return json({ error: "只有正式会员可以上传照片" }, 403)

  let body: Record<string, unknown>
  try { body = await readSmallJson(request) } catch { return json({ error: "上传内容无法读取" }, 400) }
  const action = body.action
  if (action !== "prepare" && action !== "complete" && action !== "cancel") {
    return json({ error: "上传操作无效" }, 400)
  }
  if (action !== "prepare" && (typeof body.uploadId !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.uploadId))) {
    return json({ error: "上传操作无效" }, 400)
  }

  const admin = createAdminClient()
  let claimed: UploadSession | null = null
  let bucket: string | null = null
  const writtenPaths: string[] = []
  let releaseProcessing: (() => void) | null = null
  try {
    let kind: DirectUploadKind
    if (action === "prepare") {
      if (!isDirectUploadKind(body.kind)) return json({ error: "上传类型无效" }, 400)
      if (!validateDirectUploadSize(body.size)) return json({ error: COMMUNITY_IMAGE_SIZE_ERROR }, 413)
      kind = body.kind
    } else {
      // Read ownership before choosing community vs personal-avatar permissions.
      const lookup = await admin.schema("private").from("community_direct_uploads")
        .select("kind").eq("id", body.uploadId).eq("member_id", player.memberId).maybeSingle()
      if (lookup.error) throw lookup.error
      if (!lookup.data || !isDirectUploadKind(lookup.data.kind)) return json({ error: "找不到本次上传，请重试" }, 404)
      kind = lookup.data.kind
    }
    // A personal avatar has always been independent from community sanctions.
    // Cancellation is permitted even after a user loses community write access.
    if (kind !== "profile-avatar" && action !== "cancel") {
      const context = await getCommunityContext(player)
      if (context.restriction?.type === "permanent_ban") return json({ error: "当前账号无法使用社区" }, 403)
      if (kind === "photo" && !context.canWrite) return json({ error: "当前账号暂时不能发布照片" }, 403)
    }

    if (action === "prepare") {
      const prepared = await admin.rpc("community_prepare_direct_upload", {
        p_member_id: player.memberId, p_user_id: user.id, p_kind: kind, p_expected_size: body.size,
      })
      if (prepared.error) throw prepared.error
      const session = prepared.data as UploadSession
      const signed = await admin.storage.from(COMMUNITY_UPLOAD_STAGING_BUCKET)
        .createSignedUploadUrl(session.staging_path, { upsert: false })
      if (signed.error || !signed.data?.token) {
        await admin.rpc("community_cancel_direct_upload", { p_upload_id: session.id, p_member_id: player.memberId })
        throw signed.error ?? new Error("Signed upload unavailable")
      }
      return json({
        uploadId: session.id,
        bucket: COMMUNITY_UPLOAD_STAGING_BUCKET,
        path: session.staging_path,
        token: signed.data.token,
        endpoint: directUploadEndpoint(process.env.NEXT_PUBLIC_SUPABASE_URL!),
      })
    }

    if (action === "cancel") {
      const cancelled = await admin.rpc("community_cancel_direct_upload", {
        p_upload_id: body.uploadId, p_member_id: player.memberId,
      })
      if (cancelled.error) throw cancelled.error
      return json({ cancelled: true })
    }

    releaseProcessing = tryClaimDirectImageProcessing()
    if (!releaseProcessing) return json({ pending: true, retryAfterMs: 1500 }, 202)

    const claim = await admin.rpc("community_claim_direct_upload", {
      p_upload_id: body.uploadId, p_member_id: player.memberId,
    })
    if (claim.error) throw claim.error
    const session = claim.data as UploadSession
    if (session.state === "completed" && session.result) return json(session.result)
    if (session.busy) return json({ pending: true, retryAfterMs: 1500 }, 202)
    if (!session.claim_token || !session.storage_path || !session.thumbnail_path) throw new Error("Invalid upload claim")
    claimed = session
    bucket = kind === "photo" ? COMMUNITY_MEDIA_BUCKET : COMMUNITY_AVATAR_BUCKET

    const downloaded = await admin.storage.from(COMMUNITY_UPLOAD_STAGING_BUCKET).download(session.staging_path)
    if (downloaded.error || !downloaded.data) throw downloaded.error ?? new Error("Original photo unavailable")
    if (!validateDirectUploadSize(downloaded.data.size)) throw new Error(COMMUNITY_IMAGE_SIZE_ERROR)
    if (downloaded.data.size !== session.expected_size) throw new Error("无法读取照片，请重新选择后重试")
    const processed = await normalizeCommunityImage(Buffer.from(await downloaded.data.arrayBuffer()), kind === "photo" ? "photo" : "avatar")
    const outputs = [{ path: session.storage_path, bytes: processed.main }]
    if (session.thumbnail_path !== session.storage_path) outputs.push({ path: session.thumbnail_path, bytes: processed.thumbnail })
    for (const output of outputs) {
      const uploaded = await admin.storage.from(bucket).upload(output.path, output.bytes, {
        contentType: "image/webp", cacheControl: "31536000", upsert: false,
      })
      if (uploaded.error) throw uploaded.error
      writtenPaths.push(output.path)
    }
    const result = {
      storagePath: session.storage_path,
      thumbnailPath: session.thumbnail_path,
      width: processed.width, height: processed.height,
      byteSize: processed.main.byteLength, mimeType: "image/webp",
      previewUrl: `/api/community/media?${new URLSearchParams({ bucket, path: session.thumbnail_path })}`,
    }
    const finished = await admin.rpc("community_finish_direct_upload", {
      p_upload_id: session.id, p_member_id: player.memberId, p_claim_token: session.claim_token, p_result: result,
    })
    if (finished.error) throw finished.error
    claimed = null // Registration and session completion committed atomically.
    const cleanup = await admin.storage.from(COMMUNITY_UPLOAD_STAGING_BUCKET).remove([session.staging_path])
    if (cleanup.error) console.error("[direct upload staging cleanup]", cleanup.error.message)
    return json(finished.data ?? result)
  } catch (error) {
    let resetUpload = false
    if (claimed) {
      const failed = await admin.rpc("community_cancel_direct_upload", {
        p_upload_id: claimed.id, p_member_id: player.memberId, p_claim_token: claimed.claim_token,
      })
      if (failed.error) console.error("[direct upload cancellation]", failed.error.message)
      resetUpload = !failed.error && failed.data === true
      if (!failed.error && failed.data === false) {
        const completed = await admin.schema("private").from("community_direct_uploads")
          .select("state,result").eq("id", claimed.id).eq("member_id", player.memberId).maybeSingle()
        if (completed.data?.state === "completed" && completed.data.result) return json(completed.data.result)
      }
      if (!failed.error && failed.data === true && bucket && writtenPaths.length) {
        const removed = await admin.storage.from(bucket).remove(writtenPaths)
        if (removed.error) console.error("[direct upload cleanup]", removed.error.message)
      }
      // An uncertain cancellation may still belong to a recoverable active
      // claim. Preserve its original until the durable cleanup pass decides.
      if (!failed.error && failed.data === true) {
        const removed = await admin.storage.from(COMMUNITY_UPLOAD_STAGING_BUCKET).remove([claimed.staging_path])
        if (removed.error) console.error("[direct upload staging cleanup]", removed.error.message)
      }
    }
    const message = error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message : "Upload failed"
    console.error("[community direct upload]", message)
    const status = directUploadErrorStatus(message)
    return json({ error: directUploadErrorMessage(message), ...(resetUpload || status === 410 ? { resetUpload: true } : {}) }, status)
  } finally {
    releaseProcessing?.()
  }
}
