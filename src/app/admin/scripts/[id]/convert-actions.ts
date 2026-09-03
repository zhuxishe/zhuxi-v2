"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import {
  removeStorageObjectsOrQueue,
  runContentMediaCleanupJobsForContent,
} from "@/lib/content-media-cleanup"
import { normalizeAdminAuditReason } from "@/lib/member-master/audit-reason"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

const MAX_SCRIPT_PAGES = 500
const PREVIEW_TTL_SECONDS = 15 * 60
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function updatePageImages(
  scriptId: string,
  paths: string[],
  rawReason: string,
  expectedPaths: string[],
  newUploadBatchId?: string,
) {
  const admin = await requireAdmin()
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const validationError = validatePagePaths(scriptId, paths)
  if (validationError) return { error: validationError }
  const expectedValidationError = validatePagePaths(scriptId, expectedPaths)
  if (expectedValidationError) return { error: "页面版本信息无效，请刷新后重试" }
  const newBatchError = validateNewUploadBatch(scriptId, paths, newUploadBatchId)
  if (newBatchError) return { error: newBatchError }

  const supabase = await createClient()
  const availabilityError = await ensureCurrentScript(supabase, scriptId)
  if (availabilityError) return { error: availabilityError }
  const { data: previous, error: lookupError } = await supabase
    .from("script_protected_content")
    .select("page_image_paths, updated_at")
    .eq("script_id", scriptId)
    .maybeSingle()
  if (lookupError) return { error: "读取原页面清单失败" }
  const previousPaths = previous?.page_image_paths ?? []
  if (!samePaths(previousPaths, expectedPaths)) {
    if (samePaths(previousPaths, paths)) {
      return {
        success: true,
        paths,
        previewUrls: await signPaths(paths),
        protectedUpdatedAt: previous?.updated_at ?? null,
      }
    }
    const cleanup = newUploadBatchId
      ? await removeStorageObjectsOrQueue({
          contentKind: "script",
          contentId: scriptId,
          bucketId: "scripts",
          objectPaths: paths.filter((path) => !previousPaths.includes(path)),
          reason: reasonResult.reason,
          createdBy: admin.id,
        })
      : { success: true as const }
    return {
      error: "页面清单已被其他管理员修改，请刷新后重试",
      ...(!cleanup.success ? { warning: cleanup.error } : {}),
    }
  }
  if (!newUploadBatchId && paths.some((path) => !previousPaths.includes(path))) {
    return { error: "页面清单包含当前记录之外的文件，请刷新后重试" }
  }

  const protectedPayload = {
    script_id: scriptId,
    page_image_paths: paths,
    page_count: paths.length,
    audit_reason: reasonResult.reason,
  }
  const saveResult = previous
    ? await supabase
        .from("script_protected_content")
        .update(protectedPayload)
        .eq("script_id", scriptId)
        .eq("updated_at", previous.updated_at)
        .select("script_id, updated_at")
        .maybeSingle()
    : await supabase
        .from("script_protected_content")
        .insert(protectedPayload)
        .select("script_id, updated_at")
        .maybeSingle()
  if (saveResult.error || !saveResult.data) {
    if (saveResult.error) console.error("[updatePageImages]", saveResult.error)
    const newlyUploaded = paths.filter((path) => !previousPaths.includes(path))
    const cleanup = await removeStorageObjectsOrQueue({
      contentKind: "script",
      contentId: scriptId,
      bucketId: "scripts",
      objectPaths: newlyUploaded,
      reason: reasonResult.reason,
      createdBy: admin.id,
    })
    return {
      error: saveResult.error ? "页面清单保存失败" : "剧本文件状态已经变化，页面清单未保存",
      ...(!cleanup.success ? { warning: cleanup.error } : {}),
    }
  }

  const removed = (previous?.page_image_paths ?? []).filter((path) => !paths.includes(path))
  let warning: string | undefined
  if (removed.length > 0) {
    const cleanup = await runContentMediaCleanupJobsForContent("script", scriptId)
    if (cleanup.error) warning = cleanup.error
  }
  const previewUrls = await signPaths(paths)
  revalidateScriptPaths(scriptId)
  return {
    success: true,
    paths,
    previewUrls,
    warning,
    protectedUpdatedAt: saveResult.data.updated_at,
  }
}

export async function deleteAllScriptFiles(
  scriptId: string,
  rawReason: string,
  expectedPdfStoragePath: string | null,
  expectedPagePaths: string[],
) {
  await requireAdmin()
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  if (!validExpectedPdfPath(scriptId, expectedPdfStoragePath)) {
    return { error: "PDF 版本信息无效，请刷新后重试" }
  }
  if (validatePagePaths(scriptId, expectedPagePaths)) {
    return { error: "页面版本信息无效，请刷新后重试" }
  }
  const supabase = await createClient()
  const availabilityError = await ensureCurrentScript(supabase, scriptId)
  if (availabilityError) return { error: availabilityError }
  const { data: previous, error: lookupError } = await supabase
    .from("script_protected_content")
    .select("pdf_storage_path, page_image_paths, updated_at")
    .eq("script_id", scriptId)
    .maybeSingle()
  if (lookupError) return { error: "读取文件清单失败" }
  if (!previous) {
    return expectedPdfStoragePath === null && expectedPagePaths.length === 0
      ? { success: true, paths: [], previewUrls: [], protectedUpdatedAt: null }
      : { error: "剧本文件已被其他管理员修改，请刷新后重试" }
  }
  const currentPages = previous.page_image_paths ?? []
  const currentPdf = previous.pdf_storage_path ?? null
  if (currentPdf !== expectedPdfStoragePath || !samePaths(currentPages, expectedPagePaths)) {
    if (currentPdf === null && currentPages.length === 0) {
      return {
        success: true,
        paths: [],
        previewUrls: [],
        protectedUpdatedAt: previous.updated_at,
      }
    }
    return { error: "剧本文件已被其他管理员修改，请刷新后重试" }
  }

  const { data: updated, error } = await supabase
    .from("script_protected_content")
    .update({
      pdf_storage_path: null,
      page_image_paths: [],
      page_count: 0,
      audit_reason: reasonResult.reason,
    })
    .eq("script_id", scriptId)
    .eq("updated_at", previous.updated_at)
    .select("script_id, updated_at")
    .maybeSingle()
  if (error) return { error: "删除文件记录失败" }
  if (!updated) return { error: "剧本文件状态已经变化，未执行文件删除" }

  const paths = [previous.pdf_storage_path, ...(previous.page_image_paths ?? [])]
    .filter((path): path is string => Boolean(path))
  let warning: string | undefined
  if (paths.length > 0) {
    const cleanup = await runContentMediaCleanupJobsForContent("script", scriptId)
    if (cleanup.error) warning = cleanup.error
  }
  revalidateScriptPaths(scriptId)
  return {
    success: true,
    paths: [],
    previewUrls: [],
    warning,
    protectedUpdatedAt: updated.updated_at,
  }
}

/**
 * Resolve an ambiguous browser upload after a failed/lost Server Action
 * response. Global database-reference checking makes this safe even when the
 * original page-list update actually committed before the response was lost.
 */
export async function cleanupUncommittedPageImages(
  scriptId: string,
  paths: string[],
  rawReason: string,
) {
  const admin = await requireAdmin()
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const validationError = validatePagePaths(scriptId, paths)
  if (validationError) return { error: validationError }
  const cleanup = await removeStorageObjectsOrQueue({
    contentKind: "script",
    contentId: scriptId,
    bucketId: "scripts",
    objectPaths: paths,
    reason: reasonResult.reason,
    createdBy: admin.id,
  })
  return cleanup.success
    ? { success: true }
    : { error: cleanup.error }
}

async function signPaths(paths: string[]) {
  if (paths.length === 0) return []
  const { data, error } = await createAdminClient().storage
    .from("scripts")
    .createSignedUrls(paths, PREVIEW_TTL_SECONDS)
  if (error) {
    console.error("[updatePageImages:sign]", error)
    return paths.map(() => "")
  }
  return paths.map((_, index) => data[index]?.signedUrl ?? "")
}

function validatePagePaths(scriptId: string, paths: string[]) {
  if (!Array.isArray(paths) || paths.some((path) => typeof path !== "string")) return "页面清单格式无效"
  if (paths.length > MAX_SCRIPT_PAGES) return `剧本最多支持 ${MAX_SCRIPT_PAGES} 页`
  if (new Set(paths).size !== paths.length) return "页面清单不能包含重复文件"
  const prefix = `pages/${scriptId}/`
  if (paths.some((path) => (
    !path.startsWith(prefix)
    || path.includes("..")
    || path.includes("\\")
    || path.includes("?")
    || path.includes("#")
    || path.length > 500
  ))) {
    return "页面文件路径不合法"
  }
  return null
}

function validateNewUploadBatch(
  scriptId: string,
  paths: string[],
  batchId?: string,
) {
  if (batchId === undefined) return null
  if (!UUID_PATTERN.test(batchId)) return "新上传批次编号无效"
  if (paths.length === 0) return "新上传页面清单不能为空"
  const batchPrefix = `pages/${scriptId}/${batchId}/`
  return paths.every((path) => path.startsWith(batchPrefix))
    ? null
    : "新上传页面清单与批次编号不一致"
}

function samePaths(left: string[], right: string[]) {
  return left.length === right.length && left.every((path, index) => path === right[index])
}

function validExpectedPdfPath(scriptId: string, path: unknown): path is string | null {
  if (path === null) return true
  if (typeof path !== "string") return false
  return path.startsWith(`pdfs/${scriptId}/`)
    && !path.includes("..")
    && !path.includes("\\")
    && !path.includes("?")
    && !path.includes("#")
    && path.length <= 500
}

function revalidateScriptPaths(scriptId: string) {
  revalidatePath(`/admin/scripts/${scriptId}`)
  revalidatePath(`/admin/scripts/${scriptId}/edit`)
  revalidatePath(`/app/scripts/${scriptId}`)
}

async function ensureCurrentScript(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scriptId: string,
) {
  const { data, error } = await supabase
    .from("scripts")
    .select("id")
    .eq("id", scriptId)
    .is("archived_at", null)
    .maybeSingle()
  if (error) return "读取剧本状态失败"
  return data ? null : "剧本不存在或已进入回收站"
}
