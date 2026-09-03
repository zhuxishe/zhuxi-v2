"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import {
  contentMediaCleanupOutboxIsReady,
  removeStorageObjectsOrQueue,
  runContentMediaCleanupJobsForContent,
} from "@/lib/content-media-cleanup"
import { validateSafeImageFile, imageExtension } from "@/lib/file-validation"
import { managedContentImageUrlIsCanonical } from "@/lib/content-media-url"
import { normalizeAdminAuditReason } from "@/lib/member-master/audit-reason"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { TablesUpdate } from "@/types/database.types"
import { ACTIVITY_MEDIA_BUCKET, managedActivityMediaPath } from "./media"

export type LargeActivityStatus = "draft" | "published" | "cancelled"
export type RegistrationStatus = "open" | "closed" | "coming_soon" | "ended"

export interface ReviewInput {
  request_id?: string
  title: string
  title_ja?: string
  summary: string
  summary_ja?: string
  content?: string
  content_ja?: string
  tags?: string[]
  cover_url: string
  gallery_urls?: string[]
  source_url?: string
  event_date?: string
  start_at?: string
  end_at?: string
  location?: string
  location_ja?: string
  fee_note?: string
  fee_note_ja?: string
  capacity_note?: string
  capacity_note_ja?: string
  registration_url?: string
  registration_status?: RegistrationStatus
  registration_deadline?: string
  registration_label?: string
  status?: LargeActivityStatus
  is_published?: boolean
  is_player_visible?: boolean
  sort_order?: number
  show_on_player_home?: boolean
  player_home_order?: number
  pin_in_player_library?: boolean
  player_library_order?: number
}

const MAX_ACTIVITY_IMAGE_BYTES = 8 * 1024 * 1024
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ACTIVITY_STATUSES: LargeActivityStatus[] = ["draft", "published", "cancelled"]
const REGISTRATION_STATUSES: RegistrationStatus[] = ["open", "closed", "coming_soon", "ended"]
const STALE_REVIEW_ERROR = "大型活动已在其他页面更新，请刷新后重试"

const ALLOWED_UPDATE_FIELDS = new Set([
  "title",
  "title_ja",
  "summary",
  "summary_ja",
  "content",
  "content_ja",
  "tags",
  "cover_url",
  "gallery_urls",
  "source_url",
  "event_date",
  "start_at",
  "end_at",
  "location",
  "location_ja",
  "fee_note",
  "fee_note_ja",
  "capacity_note",
  "capacity_note_ja",
  "registration_url",
  "registration_status",
  "registration_deadline",
  "registration_label",
  "status",
  "is_published",
  "is_player_visible",
  "sort_order",
  "show_on_player_home",
  "player_home_order",
  "pin_in_player_library",
  "player_library_order",
])

function normalizeUrl(value?: string) {
  return value?.trim() ?? ""
}

function isSafeImageUrl(value: string) {
  const url = normalizeUrl(value)
  if (!url || /[\u0000-\u001f"'<>\\]/.test(url)) return false
  if (url.startsWith("/")) {
    return !url.startsWith("//") && !url.toLowerCase().startsWith("/storage/v1/")
  }

  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return false
    return managedContentImageUrlIsCanonical(url) !== false
  } catch {
    return false
  }
}

function isSafeSourceUrl(value: string) {
  const url = normalizeUrl(value)
  if (!url || /[\u0000-\u001f"'<>\\]/.test(url)) return false

  try {
    return ["https:", "http:"].includes(new URL(url).protocol)
  } catch {
    return false
  }
}

function normalizeGalleryUrls(urls?: string[]) {
  return [...new Set((urls ?? []).map((url) => url.trim()).filter(Boolean))]
}

function normalizeTags(tags?: string[]) {
  return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))]
}

function isValidDateTime(value?: string) {
  return !value || !Number.isNaN(Date.parse(value))
}

function validateReviewId(id: string) {
  return UUID_PATTERN.test(id) ? null : "大型活动 ID 无效"
}

function validateReason(rawReason: string) {
  const result = normalizeAdminAuditReason(rawReason)
  return result.ok ? result : { ok: false as const, error: result.error }
}

function validateExpectedUpdatedAt(rawUpdatedAt: string) {
  const updatedAt = typeof rawUpdatedAt === "string" ? rawUpdatedAt.trim() : ""
  if (!updatedAt || updatedAt.length > 64 || Number.isNaN(Date.parse(updatedAt))) {
    return { ok: false as const, error: "页面版本无效，请刷新后重试" }
  }
  return { ok: true as const, updatedAt }
}

function validateReviewInput(
  input: Partial<ReviewInput>,
  allowedManagedUrls: ReadonlySet<string> = new Set(),
) {
  if ("title" in input && !input.title?.trim()) return "标题不能为空"
  if ("summary" in input && !input.summary?.trim()) return "简介不能为空"
  if ("cover_url" in input && !input.cover_url?.trim()) return "封面图 URL 不能为空"
  if (input.title && input.title.trim().length > 120) return "标题不能超过 120 字符"
  if (input.title_ja && input.title_ja.trim().length > 120) return "日文标题不能超过 120 字符"
  if (input.summary && input.summary.trim().length > 500) return "简介不能超过 500 字符"
  if (input.summary_ja && input.summary_ja.trim().length > 500) return "日文简介不能超过 500 字符"
  if (input.content && input.content.length > 10_000) return "详细内容不能超过 10000 字符"
  if (input.content_ja && input.content_ja.length > 10_000) return "日文详细内容不能超过 10000 字符"
  const tags = normalizeTags(input.tags)
  if (tags.length > 12 || tags.some((tag) => tag.length > 40)) return "标签最多 12 个，每个不超过 40 字符"
  const galleryUrls = normalizeGalleryUrls(input.gallery_urls)
  if (galleryUrls.length > 30) return "活动图片最多 30 张"
  if (galleryUrls.some((url) => url.length > 1000)) return "活动图片 URL 过长"
  if (input.cover_url && input.cover_url.length > 1000) return "封面图 URL 过长"
  if (input.source_url && input.source_url.length > 1000) return "来源链接过长"
  if (input.registration_url && input.registration_url.length > 1000) return "报名链接过长"
  if (input.registration_label && input.registration_label.trim().length > 80) return "报名按钮文字不能超过 80 字符"
  if (input.cover_url && !isSafeImageUrl(input.cover_url)) return "封面图请使用站内路径或 HTTPS 图片链接"
  if (galleryUrls.some((url) => !isSafeImageUrl(url))) return "更多图片请使用站内路径或 HTTPS 图片链接"
  const imageUrls = [input.cover_url, ...galleryUrls]
    .map((url) => url?.trim() ?? "")
    .filter(Boolean)
  if (imageUrls.some((url) => (
    managedContentImageUrlIsCanonical(url) === true
    && !allowedManagedUrls.has(url)
  ))) {
    return "托管图片不能通过 URL 重新引入，请使用上传功能"
  }
  if (input.source_url && !isSafeSourceUrl(input.source_url)) return "来源链接必须是 http 或 https"
  if (input.registration_url && !isSafeSourceUrl(input.registration_url)) return "报名链接必须是 http 或 https"
  if (!isValidDateTime(input.start_at) || !isValidDateTime(input.end_at)) return "活动时间格式无效"
  if (!isValidDateTime(input.registration_deadline)) return "报名截止时间格式无效"
  if (input.start_at && input.end_at && Date.parse(input.end_at) < Date.parse(input.start_at)) {
    return "结束时间不能早于开始时间"
  }
  if (input.status && !ACTIVITY_STATUSES.includes(input.status)) return "活动状态无效"
  if (input.registration_status && !REGISTRATION_STATUSES.includes(input.registration_status)) return "报名状态无效"
  if (input.sort_order !== undefined && (input.sort_order < 0 || input.sort_order > 9999)) {
    return "排序值必须在 0-9999 之间"
  }
  for (const [label, value] of [
    ["活动首页排序", input.player_home_order],
    ["大型活动库排序", input.player_library_order],
  ] as const) {
    if (value !== undefined && (!Number.isInteger(value) || Math.abs(value) > 999_999)) {
      return `${label}必须是 -999999 到 999999 之间的整数`
    }
  }
  return null
}

function revalidateReviewPaths(id?: string) {
  revalidatePath("/reviews")
  revalidatePath("/admin/reviews")
  revalidatePath("/app/scripts")
  revalidatePath("/app/scripts/large")
  if (id) revalidatePath(`/app/scripts/large/${id}`)
}

function formatReviewDbError(error: { code?: string; message?: string }) {
  const message = error.message ?? ""
  if (["PGRST204", "PGRST205", "42703"].includes(error.code ?? "")) {
    return "数据库尚未应用内容管理 V2 迁移"
  }
  if (message.includes("CONTENT_MANAGEMENT_ADMIN_REQUIRED")) return "管理员权限已失效，请重新登录"
  if (message.includes("CONTENT_MANAGEMENT_SUPER_ADMIN_REQUIRED")) return "仅超级管理员可以执行此操作"
  if (message.includes("CONTENT_MANAGEMENT_NOT_ARCHIVED")) return "只能永久删除回收站中的大型活动"
  if (message.includes("CONTENT_MANAGEMENT_REASON_INVALID")) return "操作理由需为 4–500 个字符"
  if (message.includes("CONTENT_MANAGEMENT_ARCHIVED_ROW_IMMUTABLE")) return "回收站中的大型活动不能直接修改"
  if (message.includes("CONTENT_MANAGEMENT_ARCHIVE_STATE_INVALID")) return "大型活动归档状态无效"
  if (message.includes("CONTENT_MANAGEMENT_TARGET_NOT_FOUND")) return "大型活动不存在"
  if (message.includes("CONTENT_MANAGEMENT_VERSION_CONFLICT") || error.code === "40001") {
    return STALE_REVIEW_ERROR
  }
  if (error.code === "P0002") return "大型活动不存在或状态已经变化"
  return "操作失败"
}

function normalizeReviewPayload(input: ReviewInput, auditReason: string) {
  const status = input.status ?? "draft"
  return {
    source_key: null,
    title: input.title.trim(),
    title_ja: input.title_ja?.trim() || null,
    summary: input.summary.trim(),
    summary_ja: input.summary_ja?.trim() || null,
    content: input.content?.trim() || null,
    content_ja: input.content_ja?.trim() || null,
    tags: normalizeTags(input.tags),
    cover_url: input.cover_url.trim(),
    gallery_urls: normalizeGalleryUrls(input.gallery_urls),
    source_url: input.source_url?.trim() || null,
    event_date: input.event_date || null,
    start_at: input.start_at || null,
    end_at: input.end_at || null,
    location: input.location?.trim() || null,
    location_ja: input.location_ja?.trim() || null,
    fee_note: input.fee_note?.trim() || null,
    fee_note_ja: input.fee_note_ja?.trim() || null,
    capacity_note: input.capacity_note?.trim() || null,
    capacity_note_ja: input.capacity_note_ja?.trim() || null,
    registration_url: input.registration_url?.trim() || null,
    registration_status: input.registration_status ?? "coming_soon",
    registration_deadline: input.registration_deadline || null,
    registration_label: input.registration_label?.trim() || null,
    status,
    is_published: input.is_published ?? false,
    is_player_visible: input.is_player_visible ?? false,
    sort_order: input.sort_order ?? 0,
    show_on_player_home: input.show_on_player_home ?? false,
    player_home_order: input.player_home_order ?? 0,
    pin_in_player_library: input.pin_in_player_library ?? false,
    player_library_order: input.player_library_order ?? 0,
    audit_reason: auditReason,
  }
}

export async function createPastEventReview(input: ReviewInput, rawReason: string) {
  await requireAdmin()
  const reasonResult = validateReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const validationError = validateReviewInput(input)
  if (validationError) return { error: validationError }
  const requestId = input.request_id ?? crypto.randomUUID()
  if (!UUID_PATTERN.test(requestId)) return { error: "新建请求编号无效，请刷新页面后重试" }

  const supabase = await createClient()
  const payload = { id: requestId, ...normalizeReviewPayload(input, reasonResult.reason) }
  const { data, error } = await supabase
    .from("past_event_reviews")
    .insert(payload)
    .select("id")
    .single()

  if (error?.code === "23505") {
    const { data: existing, error: existingError } = await supabase
      .from("past_event_reviews")
      .select("*")
      .eq("id", requestId)
      .maybeSingle()
    if (!existingError && existing && !existing.archived_at && reviewCreationPayloadMatches(existing, payload)) {
      return { success: true, reviewId: existing.id }
    }
    return { error: "新建请求编号已被占用，请刷新页面后重试" }
  }
  if (error) {
    console.error("[createPastEventReview]", error)
    return { error: formatReviewDbError(error) }
  }
  revalidateReviewPaths(data.id)
  return { success: true, reviewId: data.id }
}

function reviewCreationPayloadMatches(
  existing: Record<string, unknown>,
  expected: Record<string, unknown>,
) {
  return Object.entries(expected).every(([key, value]) => (
    key === "audit_reason" || JSON.stringify(existing[key]) === JSON.stringify(value)
  ))
}

export async function updatePastEventReview(
  id: string,
  input: Partial<ReviewInput>,
  rawReason: string,
  expectedUpdatedAt: string,
) {
  await requireAdmin()
  const idError = validateReviewId(id)
  if (idError) return { error: idError }
  const reasonResult = validateReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const revisionResult = validateExpectedUpdatedAt(expectedUpdatedAt)
  if (!revisionResult.ok) return { error: revisionResult.error }
  const supabase = await createClient()
  const { data: current, error: currentError } = await supabase
    .from("past_event_reviews")
    .select("cover_url, gallery_urls, archived_at, updated_at")
    .eq("id", id)
    .maybeSingle()
  if (currentError) return { error: formatReviewDbError(currentError) }
  if (!current) return { error: "大型活动不存在" }
  if (current.archived_at) return { error: "回收站中的大型活动不能直接编辑，请先恢复" }
  if (current.updated_at !== revisionResult.updatedAt) return { error: STALE_REVIEW_ERROR }
  const allowedManagedUrls = new Set([
    current.cover_url,
    ...normalizeGalleryUrls(current.gallery_urls as unknown as string[]),
  ].map((url) => url.trim()).filter(Boolean))
  const validationError = validateReviewInput(input, allowedManagedUrls)
  if (validationError) return { error: validationError }

  const filtered: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED_UPDATE_FIELDS.has(key)) continue
    filtered[key] = Array.isArray(value)
      ? key === "tags" ? normalizeTags(value) : normalizeGalleryUrls(value)
      : typeof value === "string" ? value.trim() || null : value
  }
  if (Object.keys(filtered).length === 0) return { error: "无有效更新字段" }
  filtered.audit_reason = reasonResult.reason

  const { data, error } = await supabase
    .from("past_event_reviews")
    .update(filtered as TablesUpdate<"past_event_reviews">)
    .eq("id", id)
    .eq("updated_at", revisionResult.updatedAt)
    .is("archived_at", null)
    .select("id, updated_at")
    .maybeSingle()

  if (error) {
    console.error("[updatePastEventReview]", error)
    return { error: formatReviewDbError(error) }
  }
  if (!data) return { error: STALE_REVIEW_ERROR }

  const nextCover = typeof filtered.cover_url === "string" ? filtered.cover_url : current.cover_url
  const nextGallery = Array.isArray(filtered.gallery_urls)
    ? filtered.gallery_urls.filter((url): url is string => typeof url === "string")
    : normalizeGalleryUrls(current.gallery_urls as unknown as string[])
  const retained = new Set([nextCover, ...nextGallery])
  const removed = [current.cover_url, ...normalizeGalleryUrls(current.gallery_urls as unknown as string[])]
    .filter((url) => !retained.has(url))
  const cleanup = await removeManagedActivityMedia(
    id,
    removed,
  )

  revalidateReviewPaths(id)
  if (!cleanup.success) {
    return { success: true, updatedAt: data.updated_at, warning: cleanup.error }
  }
  return { success: true, updatedAt: data.updated_at }
}

export async function togglePastEventReviewPublished(
  id: string,
  isPublished: boolean,
  rawReason: string,
  expectedUpdatedAt: string,
) {
  return updatePastEventReview(id, { is_published: isPublished }, rawReason, expectedUpdatedAt)
}

export async function togglePastEventReviewPlayerVisible(
  id: string,
  isPlayerVisible: boolean,
  rawReason: string,
  expectedUpdatedAt: string,
) {
  return updatePastEventReview(id, { is_player_visible: isPlayerVisible }, rawReason, expectedUpdatedAt)
}

export async function archivePastEventReview(id: string, rawReason: string, expectedUpdatedAt: string) {
  const admin = await requireAdmin()
  const idError = validateReviewId(id)
  if (idError) return { error: idError }
  const reasonResult = validateReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const revisionResult = validateExpectedUpdatedAt(expectedUpdatedAt)
  if (!revisionResult.ok) return { error: revisionResult.error }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("past_event_reviews")
    .update({
      archived_at: new Date().toISOString(),
      archived_by: admin.id,
      archive_reason: reasonResult.reason,
      is_published: false,
      is_player_visible: false,
      show_on_player_home: false,
      pin_in_player_library: false,
      audit_reason: reasonResult.reason,
    })
    .eq("id", id)
    .eq("updated_at", revisionResult.updatedAt)
    .is("archived_at", null)
    .select("id, updated_at")
    .maybeSingle()

  if (error) return { error: formatReviewDbError(error) }
  if (!data) return { error: STALE_REVIEW_ERROR }
  revalidateReviewPaths(id)
  return { success: true, updatedAt: data.updated_at }
}

export async function restorePastEventReview(id: string, rawReason: string, expectedUpdatedAt: string) {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { error: "仅超级管理员可以恢复大型活动" }
  const idError = validateReviewId(id)
  if (idError) return { error: idError }
  const reasonResult = validateReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const revisionResult = validateExpectedUpdatedAt(expectedUpdatedAt)
  if (!revisionResult.ok) return { error: revisionResult.error }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("past_event_reviews")
    .update({
      archived_at: null,
      archived_by: null,
      archive_reason: null,
      audit_reason: reasonResult.reason,
    })
    .eq("id", id)
    .eq("updated_at", revisionResult.updatedAt)
    .not("archived_at", "is", null)
    .select("id, updated_at")
    .maybeSingle()

  if (error) return { error: formatReviewDbError(error) }
  if (!data) return { error: STALE_REVIEW_ERROR }
  revalidateReviewPaths(id)
  return { success: true, updatedAt: data.updated_at }
}

export async function permanentlyDeletePastEventReview(id: string, rawReason: string, expectedUpdatedAt: string) {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { error: "仅超级管理员可以永久删除大型活动" }
  const idError = validateReviewId(id)
  if (idError) return { error: idError }
  const reasonResult = validateReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const revisionResult = validateExpectedUpdatedAt(expectedUpdatedAt)
  if (!revisionResult.ok) return { error: revisionResult.error }
  if (!(await contentMediaCleanupOutboxIsReady())) {
    return { error: "数据库尚未应用内容管理 V2 Contract，已停止永久删除" }
  }

  const storageDb = createAdminClient()
  const { data: review, error: reviewError } = await storageDb
    .from("past_event_reviews")
    .select("cover_url, gallery_urls, archived_at, updated_at")
    .eq("id", id)
    .maybeSingle()
  if (reviewError) return { error: formatReviewDbError(reviewError) }
  if (!review) return { error: "大型活动不存在" }
  if (!review.archived_at) return { error: "只能永久删除回收站中的大型活动" }
  if (review.updated_at !== revisionResult.updatedAt) return { error: STALE_REVIEW_ERROR }

  const supabase = await createClient()
  const { error } = await supabase.rpc("admin_hard_delete_past_event_review_v2", {
    p_review_id: id,
    p_reason: reasonResult.reason,
    p_expected_updated_at: revisionResult.updatedAt,
  })
  if (error) {
    console.error("[permanentlyDeletePastEventReview]", error)
    return { error: formatReviewDbError(error) }
  }

  revalidateReviewPaths(id)
  const cleanupResult = await runContentMediaCleanupJobsForContent("past_event_review", id)
  if (cleanupResult.error) {
    return {
      success: true,
      warning: "记录已永久删除，但仍有图片待清理；任务已保存在回收站页面，可安全重试。",
    }
  }
  return { success: true }
}

export async function uploadPastEventReviewMedia(
  id: string,
  kind: "cover" | "gallery",
  formData: FormData,
  rawReason: string,
  expectedUpdatedAt: string,
) {
  const admin = await requireAdmin()
  const idError = validateReviewId(id)
  if (idError) return { error: idError }
  const reasonResult = validateReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const revisionResult = validateExpectedUpdatedAt(expectedUpdatedAt)
  if (!revisionResult.ok) return { error: revisionResult.error }
  if (kind !== "cover" && kind !== "gallery") return { error: "图片类型无效" }

  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) return { error: "请选择图片文件" }
  const validation = await validateSafeImageFile(file)
  if (!validation.valid) return { error: validation.error }
  if (file.size > MAX_ACTIVITY_IMAGE_BYTES) return { error: "图片不能超过 8MB" }
  const extension = imageExtension(file.type)
  if (!extension) return { error: "仅支持 JPG / PNG / WebP" }

  const supabase = await createClient()
  const storageAdmin = createAdminClient()
  const { data: review, error: reviewError } = await supabase
    .from("past_event_reviews")
    .select("cover_url, gallery_urls, archived_at, updated_at")
    .eq("id", id)
    .maybeSingle()
  if (reviewError) return { error: formatReviewDbError(reviewError) }
  if (!review) return { error: "大型活动不存在" }
  if (review.archived_at) return { error: "不能修改回收站中的大型活动媒体" }
  if (review.updated_at !== revisionResult.updatedAt) return { error: STALE_REVIEW_ERROR }
  const currentGallery = normalizeGalleryUrls(review.gallery_urls as unknown as string[])
  if (kind === "gallery" && currentGallery.length >= 30) return { error: "活动图片最多 30 张" }

  const objectPath = `activities/${id}/${kind}/${crypto.randomUUID()}.${extension}`
  const { error: uploadError } = await storageAdmin.storage
    .from(ACTIVITY_MEDIA_BUCKET)
    .upload(objectPath, file, { contentType: file.type, upsert: false })
  if (uploadError) {
    const cleanup = await removeStorageObjectsOrQueue({
      contentKind: "past_event_review",
      contentId: id,
      bucketId: ACTIVITY_MEDIA_BUCKET,
      objectPaths: [objectPath],
      reason: reasonResult.reason,
      createdBy: admin.id,
    })
    console.error("[uploadPastEventReviewMedia]", uploadError)
    return { error: cleanup.success ? "图片上传失败" : `图片上传失败；${cleanup.error}` }
  }

  const { data: urlData } = storageAdmin.storage.from(ACTIVITY_MEDIA_BUCKET).getPublicUrl(objectPath)
  const nextGallery = kind === "gallery"
    ? [...currentGallery, urlData.publicUrl]
    : undefined
  const payload = kind === "cover"
    ? { cover_url: urlData.publicUrl, audit_reason: reasonResult.reason }
    : { gallery_urls: nextGallery, audit_reason: reasonResult.reason }
  const { data, error } = await supabase
    .from("past_event_reviews")
    .update(payload)
    .eq("id", id)
    .eq("updated_at", revisionResult.updatedAt)
    .is("archived_at", null)
    .select("id, updated_at")
    .maybeSingle()

  if (error || !data) {
    const cleanup = await removeStorageObjectsOrQueue({
      contentKind: "past_event_review",
      contentId: id,
      bucketId: ACTIVITY_MEDIA_BUCKET,
      objectPaths: [objectPath],
      reason: reasonResult.reason,
      createdBy: admin.id,
    })
    return {
      error: `${error ? formatReviewDbError(error) : STALE_REVIEW_ERROR}${cleanup.success ? "" : `；${cleanup.error}`}`,
    }
  }

  let warning: string | undefined
  if (kind === "cover") {
    const cleanup = await removeManagedActivityMedia(
      id,
      [review.cover_url],
    )
    if (!cleanup.success) warning = cleanup.error
  }
  revalidateReviewPaths(id)
  return { success: true, url: urlData.publicUrl, updatedAt: data.updated_at, warning }
}

export async function removePastEventReviewGalleryImage(
  id: string,
  url: string,
  rawReason: string,
  expectedUpdatedAt: string,
) {
  await requireAdmin()
  const idError = validateReviewId(id)
  if (idError) return { error: idError }
  const reasonResult = validateReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const revisionResult = validateExpectedUpdatedAt(expectedUpdatedAt)
  if (!revisionResult.ok) return { error: revisionResult.error }

  const normalizedUrl = normalizeUrl(url)
  const supabase = await createClient()
  const { data: review, error: reviewError } = await supabase
    .from("past_event_reviews")
    .select("gallery_urls, archived_at, updated_at")
    .eq("id", id)
    .maybeSingle()
  if (reviewError) return { error: formatReviewDbError(reviewError) }
  if (!review) return { error: "大型活动不存在" }
  if (review.archived_at) return { error: "不能修改回收站中的大型活动媒体" }
  if (review.updated_at !== revisionResult.updatedAt) return { error: STALE_REVIEW_ERROR }

  const currentGallery = normalizeGalleryUrls(review.gallery_urls as unknown as string[])
  if (!currentGallery.includes(normalizedUrl)) return { error: "图片已经被移除" }
  const { data, error } = await supabase
    .from("past_event_reviews")
    .update({
      gallery_urls: currentGallery.filter((item) => item !== normalizedUrl),
      audit_reason: reasonResult.reason,
    })
    .eq("id", id)
    .eq("updated_at", revisionResult.updatedAt)
    .is("archived_at", null)
    .select("id, updated_at")
    .maybeSingle()
  if (error) return { error: formatReviewDbError(error) }
  if (!data) return { error: STALE_REVIEW_ERROR }

  const cleanup = await removeManagedActivityMedia(
    id,
    [normalizedUrl],
  )
  revalidateReviewPaths(id)
  if (!cleanup.success) {
    return { success: true, updatedAt: data.updated_at, warning: cleanup.error }
  }
  return { success: true, updatedAt: data.updated_at }
}

async function removeManagedActivityMedia(
  reviewId: string,
  urls: Array<string | null | undefined>,
) {
  const paths = managedActivityMediaPaths(reviewId, urls)
  if (paths.length === 0) return { success: true as const }
  const result = await runContentMediaCleanupJobsForContent("past_event_review", reviewId)
  return result.error
    ? { success: false as const, error: result.error }
    : { success: true as const }
}

function managedActivityMediaPaths(
  reviewId: string,
  urls: Array<string | null | undefined>,
) {
  return [...new Set(urls.flatMap((url) => {
    const path = url ? managedActivityMediaPath(url) : null
    return path && path.startsWith(`activities/${reviewId}/`) ? [path] : []
  }))]
}
