"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import {
  contentMediaCleanupOutboxIsReady,
  removeStorageObjectsOrQueue,
  runContentMediaCleanupJobsForContent,
} from "@/lib/content-media-cleanup"
import { managedContentImageUrlIsCanonical } from "@/lib/content-media-url"
import {
  type DirectImageUploadMetadata,
  validateDirectImageUploadMetadata,
  validateDirectlyUploadedImage,
} from "@/lib/direct-image-upload"
import { normalizeAdminAuditReason } from "@/lib/member-master/audit-reason"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

const SCRIPT_COVER_BUCKET = "scripts-covers"
const MAX_SCRIPT_COVER_BYTES = 5 * 1024 * 1024
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function prepareScriptCoverUpload(
  scriptId: string,
  fileMetadata: DirectImageUploadMetadata,
  rawReason: string,
  expectedCoverUrl: string | null,
) {
  await requireAdmin()
  if (!(await contentMediaCleanupOutboxIsReady())) {
    return { error: "数据库尚未完成内容管理 V2 Contract，暂时不能上传封面" }
  }
  if (!UUID_PATTERN.test(scriptId)) return { error: "剧本编号无效" }
  if (!isNullableString(expectedCoverUrl)) return { error: "封面版本信息无效，请刷新后重试" }
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const metadata = validateDirectImageUploadMetadata(fileMetadata, MAX_SCRIPT_COVER_BYTES)
  if (!metadata.ok) return { error: metadata.error }

  const db = await createClient()
  const { data: current, error: lookupError } = await db
    .from("scripts")
    .select("cover_url, archived_at, updated_at")
    .eq("id", scriptId)
    .maybeSingle()
  if (lookupError || !current) return { error: "剧本不存在" }
  if (current.archived_at) return { error: "回收站中的剧本不能更换封面" }
  if (current.cover_url !== expectedCoverUrl) return { error: "封面已被其他管理员修改，请刷新后重试" }

  const path = `covers/${scriptId}/${crypto.randomUUID()}.${metadata.extension}`
  const { data: signed, error: signedError } = await createAdminClient().storage
    .from(SCRIPT_COVER_BUCKET)
    .createSignedUploadUrl(path, { upsert: false })
  if (signedError || !signed) {
    console.error("[prepareScriptCoverUpload]", signedError)
    return { error: "无法准备封面上传，请稍后重试" }
  }
  return {
    success: true,
    bucket: SCRIPT_COVER_BUCKET,
    path,
    token: signed.token,
    preparedUpdatedAt: current.updated_at,
  }
}

export async function finalizeScriptCoverUpload(
  scriptId: string,
  objectPath: string,
  rawReason: string,
  expectedCoverUrl: string | null,
  preparedUpdatedAt: string,
) {
  const admin = await requireAdmin()
  if (!(await contentMediaCleanupOutboxIsReady())) {
    return { error: "数据库尚未完成内容管理 V2 Contract，暂时不能上传封面" }
  }
  if (!UUID_PATTERN.test(scriptId) || !scriptCoverPathIsValid(objectPath, scriptId)) {
    return { error: "封面上传路径无效" }
  }
  if (!isNullableString(expectedCoverUrl) || !validRevision(preparedUpdatedAt)) {
    return { error: "封面版本信息无效，请刷新后重试" }
  }
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }

  const storage = createAdminClient().storage.from(SCRIPT_COVER_BUCKET)
  const { data: urlData } = storage.getPublicUrl(objectPath)
  const db = await createClient()
  const { data: current, error: lookupError } = await db
    .from("scripts")
    .select("cover_url, archived_at, updated_at")
    .eq("id", scriptId)
    .maybeSingle()

  // The database may have committed even if the browser lost the response.
  if (current?.cover_url && managedScriptCoverPath(current.cover_url, scriptId) === objectPath) {
    return { success: true, url: current.cover_url, updatedAt: current.updated_at }
  }
  if (lookupError || !current || current.archived_at) {
    const cleanup = await discardPreparedScriptCover(admin.id, scriptId, objectPath, reasonResult.reason)
    return { error: cleanup.success ? "剧本不存在或已进入回收站" : `剧本不存在或已进入回收站；${cleanup.error}` }
  }
  if (current.cover_url !== expectedCoverUrl || current.updated_at !== preparedUpdatedAt) {
    const cleanup = await discardPreparedScriptCover(admin.id, scriptId, objectPath, reasonResult.reason)
    return { error: cleanup.success ? "封面已被其他管理员修改，请刷新后重试" : `封面已被其他管理员修改；${cleanup.error}` }
  }

  const validation = await validateDirectlyUploadedImage(
    SCRIPT_COVER_BUCKET,
    objectPath,
    MAX_SCRIPT_COVER_BYTES,
  )
  if (!validation.ok) {
    const cleanup = await discardPreparedScriptCover(admin.id, scriptId, objectPath, reasonResult.reason)
    return { error: cleanup.success ? validation.error : `${validation.error}；${cleanup.error}` }
  }

  const { data: updated, error: dbError } = await db
    .from("scripts")
    .update({ cover_url: urlData.publicUrl, audit_reason: reasonResult.reason })
    .eq("id", scriptId)
    .eq("updated_at", preparedUpdatedAt)
    .is("archived_at", null)
    .select("id, updated_at")
    .maybeSingle()
  if (dbError || !updated) {
    if (dbError) console.error("[finalizeScriptCoverUpload:db]", dbError)
    const { data: committed, error: confirmError } = await db
      .from("scripts")
      .select("cover_url, updated_at")
      .eq("id", scriptId)
      .maybeSingle()
    if (committed?.cover_url && managedScriptCoverPath(committed.cover_url, scriptId) === objectPath) {
      revalidateScriptPaths(scriptId)
      return { success: true, url: committed.cover_url, updatedAt: committed.updated_at }
    }
    if (confirmError) {
      return { error: "封面保存结果无法确认，请刷新页面核对后再操作" }
    }
    const cleanup = await discardPreparedScriptCover(admin.id, scriptId, objectPath, reasonResult.reason)
    return {
      error: `${dbError ? "封面记录保存失败" : "剧本状态已经变化，封面未保存"}${cleanup.success ? "" : `；${cleanup.error}`}`,
    }
  }

  const oldPath = current.cover_url ? managedScriptCoverPath(current.cover_url, scriptId) : null
  if (oldPath && oldPath !== objectPath) {
    const cleanup = await runContentMediaCleanupJobsForContent("script", scriptId)
    if (cleanup.error) {
      revalidateScriptPaths(scriptId)
      return { success: true, url: urlData.publicUrl, warning: cleanup.error }
    }
  }
  revalidateScriptPaths(scriptId)
  return { success: true, url: urlData.publicUrl, updatedAt: updated.updated_at }
}

export async function discardScriptCoverUpload(
  scriptId: string,
  objectPath: string,
  rawReason: string,
) {
  const admin = await requireAdmin()
  if (!(await contentMediaCleanupOutboxIsReady())) {
    return { error: "数据库尚未完成内容管理 V2 Contract，暂时不能上传封面" }
  }
  if (!UUID_PATTERN.test(scriptId) || !scriptCoverPathIsValid(objectPath, scriptId)) {
    return { error: "封面上传路径无效" }
  }
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const cleanup = await discardPreparedScriptCover(admin.id, scriptId, objectPath, reasonResult.reason)
  return cleanup.success ? { success: true } : { error: cleanup.error }
}

export async function removeScriptCover(
  scriptId: string,
  rawReason: string,
  expectedCoverUrl: string | null,
) {
  await requireAdmin()
  if (!isNullableString(expectedCoverUrl)) return { error: "封面版本信息无效，请刷新后重试" }
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const db = await createClient()
  const { data: current, error: lookupError } = await db
    .from("scripts")
    .select("cover_url, updated_at")
    .eq("id", scriptId)
    .is("archived_at", null)
    .maybeSingle()
  if (lookupError || !current) return { error: "剧本不存在或已进入回收站" }
  if (current.cover_url !== expectedCoverUrl) return { error: "封面已被其他管理员修改，请刷新后重试" }
  const { data: updated, error } = await db
    .from("scripts")
    .update({ cover_url: null, audit_reason: reasonResult.reason })
    .eq("id", scriptId)
    .eq("updated_at", current.updated_at)
    .is("archived_at", null)
    .select("id, updated_at")
    .maybeSingle()
  if (error) return { error: "移除封面失败" }
  if (!updated) return { error: "剧本状态已经变化，封面未移除" }
  const oldPath = current.cover_url ? managedScriptCoverPath(current.cover_url, scriptId) : null
  if (oldPath) {
    const cleanup = await runContentMediaCleanupJobsForContent("script", scriptId)
    if (cleanup.error) {
      revalidateScriptPaths(scriptId)
      return { success: true, warning: cleanup.error }
    }
  }
  revalidateScriptPaths(scriptId)
  return { success: true, updatedAt: updated.updated_at }
}

export async function replaceScriptCoverWithExternalUrl(
  scriptId: string,
  rawUrl: string,
  rawReason: string,
  expectedCoverUrl: string | null,
) {
  await requireAdmin()
  if (!isNullableString(expectedCoverUrl)) return { error: "封面版本信息无效，请刷新后重试" }
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const url = rawUrl.trim()
  if (!isAllowedExternalImageUrl(url)) return { error: "外部封面必须使用有效的 HTTPS 链接" }
  const db = await createClient()
  const { data: current, error: lookupError } = await db
    .from("scripts")
    .select("cover_url, updated_at")
    .eq("id", scriptId)
    .is("archived_at", null)
    .maybeSingle()
  if (lookupError || !current) return { error: "剧本不存在或已进入回收站" }
  if (current.cover_url !== expectedCoverUrl) return { error: "封面已被其他管理员修改，请刷新后重试" }
  const { data: updated, error } = await db
    .from("scripts")
    .update({ cover_url: url, audit_reason: reasonResult.reason })
    .eq("id", scriptId)
    .eq("updated_at", current.updated_at)
    .is("archived_at", null)
    .select("id, updated_at")
    .maybeSingle()
  if (error) return { error: "外部封面保存失败" }
  if (!updated) return { error: "剧本状态已经变化，外部封面未保存" }
  const oldPath = current.cover_url ? managedScriptCoverPath(current.cover_url, scriptId) : null
  if (oldPath) {
    const cleanup = await runContentMediaCleanupJobsForContent("script", scriptId)
    if (cleanup.error) {
      revalidateScriptPaths(scriptId)
      return { success: true, url, warning: cleanup.error }
    }
  }
  revalidateScriptPaths(scriptId)
  return { success: true, url, updatedAt: updated.updated_at }
}

export async function uploadScriptPdf(
  scriptId: string,
  formData: FormData,
  expectedPdfStoragePath: string | null,
) {
  const admin = await requireAdmin()
  if (!isNullableString(expectedPdfStoragePath)) return { error: "PDF 版本信息无效，请刷新后重试" }
  const reasonResult = normalizeAdminAuditReason(String(formData.get("auditReason") ?? ""))
  if (!reasonResult.ok) return { error: reasonResult.error }
  const file = formData.get("file") as File | null
  if (!file) return { error: "文件不能为空" }
  if (file.type !== "application/pdf") return { error: "仅支持 PDF 格式" }
  if (file.size > 50 * 1024 * 1024) return { error: "文件大小不能超过 50MB" }

  const db = await createClient()
  const [{ data: script, error: scriptError }, { data: previous, error: lookupError }] = await Promise.all([
    db.from("scripts").select("id").eq("id", scriptId).is("archived_at", null).maybeSingle(),
    db.from("script_protected_content").select("pdf_storage_path, updated_at").eq("script_id", scriptId).maybeSingle(),
  ])
  if (scriptError || lookupError) return { error: "读取原文件信息失败" }
  if (!script) return { error: "剧本不存在或已进入回收站" }
  if ((previous?.pdf_storage_path ?? null) !== expectedPdfStoragePath) {
    return { error: "PDF 已被其他管理员修改，请刷新后重试" }
  }

  const storage = createAdminClient().storage.from("scripts")
  const path = `pdfs/${scriptId}/${crypto.randomUUID()}.pdf`
  const { error: uploadError } = await storage.upload(path, file, {
    contentType: "application/pdf",
    upsert: false,
  })
  if (uploadError) {
    const cleanup = await removeStorageObjectsOrQueue({
      contentKind: "script",
      contentId: scriptId,
      bucketId: "scripts",
      objectPaths: [path],
      reason: reasonResult.reason,
      createdBy: admin.id,
    })
    return { error: cleanup.success ? "PDF 上传失败" : `PDF 上传失败；${cleanup.error}` }
  }

  const protectedPayload = {
    script_id: scriptId,
    pdf_storage_path: path,
    audit_reason: reasonResult.reason,
  }
  const saveResult = previous
    ? await db
        .from("script_protected_content")
        .update(protectedPayload)
        .eq("script_id", scriptId)
        .eq("updated_at", previous.updated_at)
        .select("script_id, updated_at")
        .maybeSingle()
    : await db
        .from("script_protected_content")
        .insert(protectedPayload)
        .select("script_id, updated_at")
        .maybeSingle()
  if (saveResult.error || !saveResult.data) {
    const cleanup = await removeStorageObjectsOrQueue({
      contentKind: "script",
      contentId: scriptId,
      bucketId: "scripts",
      objectPaths: [path],
      reason: reasonResult.reason,
      createdBy: admin.id,
    })
    return {
      error: `${saveResult.error ? "PDF 记录保存失败" : "剧本文件状态已经变化，PDF 未保存"}${cleanup.success ? "" : `；${cleanup.error}`}`,
    }
  }
  let warning: string | undefined
  if (previous?.pdf_storage_path && previous.pdf_storage_path !== path) {
    const cleanup = await runContentMediaCleanupJobsForContent("script", scriptId)
    if (cleanup.error) warning = cleanup.error
  }
  const { data: signed } = await storage.createSignedUrl(path, 15 * 60)
  revalidateScriptPaths(scriptId)
  return {
    success: true,
    url: signed?.signedUrl ?? null,
    path,
    warning,
    protectedUpdatedAt: saveResult.data.updated_at,
  }
}

function revalidateScriptPaths(scriptId: string) {
  revalidatePath("/admin/scripts")
  revalidatePath(`/admin/scripts/${scriptId}`)
  revalidatePath(`/admin/scripts/${scriptId}/edit`)
  revalidatePath(`/app/scripts/${scriptId}`)
}

function managedScriptCoverPath(url: string, scriptId: string) {
  try {
    if (managedContentImageUrlIsCanonical(url) !== true) return null
    const parsed = new URL(url)
    const configuredHost = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.toLowerCase()
      : null
    const allowedHosts = new Set([
      "wjjhprflldvclulistcx.supabase.co",
      "api.zhuxishe.com",
      ...(configuredHost ? [configuredHost] : []),
    ])
    if (!allowedHosts.has(parsed.hostname.toLowerCase())) return null
    const marker = "/storage/v1/object/public/scripts-covers/"
    if (!parsed.pathname.startsWith(marker)) return null
    const path = parsed.pathname.slice(marker.length)
    if (
      !path.startsWith(`covers/${scriptId}/`)
      || path.includes("..")
      || path.includes("\\")
      || path.includes("?")
      || path.includes("#")
    ) return null
    return path
  } catch {
    return null
  }
  return null
}

function isAllowedExternalImageUrl(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === "https:"
      && !parsed.username
      && !parsed.password
      && managedContentImageUrlIsCanonical(value) === null
  } catch {
    return false
  }
}

function scriptCoverPathIsValid(path: string, scriptId: string) {
  if (!path.startsWith(`covers/${scriptId}/`) || path.length > 500) return false
  const filename = path.slice(`covers/${scriptId}/`.length)
  const dot = filename.lastIndexOf(".")
  if (dot < 1) return false
  return UUID_PATTERN.test(filename.slice(0, dot))
    && ["jpg", "png", "webp"].includes(filename.slice(dot + 1))
    && !path.includes("..")
    && !path.includes("\\")
    && !path.includes("?")
    && !path.includes("#")
}

function validRevision(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 20
    && value.length <= 40
    && Number.isFinite(Date.parse(value))
}

async function discardPreparedScriptCover(
  adminId: string,
  scriptId: string,
  objectPath: string,
  reason: string,
) {
  return removeStorageObjectsOrQueue({
    contentKind: "script",
    contentId: scriptId,
    bucketId: SCRIPT_COVER_BUCKET,
    objectPaths: [objectPath],
    reason,
    createdBy: adminId,
  })
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}
