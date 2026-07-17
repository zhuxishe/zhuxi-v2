"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { createAdminClient } from "@/lib/supabase/admin"
import { isSupportedPlayerImageUrl } from "@/lib/player-activity/image-url"

export type LargeActivityStatus = "draft" | "published" | "cancelled"

export interface ReviewInput {
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
  status?: LargeActivityStatus
  is_published?: boolean
  sort_order?: number
  show_on_player_home?: boolean
  player_home_order?: number
  pin_in_player_library?: boolean
  player_library_order?: number
}

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
  "status",
  "is_published",
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
  return isSupportedPlayerImageUrl(normalizeUrl(value))
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
  return (urls ?? []).map((url) => url.trim()).filter(Boolean)
}

function normalizeTags(tags?: string[]) {
  return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))]
}

function isValidDateTime(value?: string) {
  return !value || !Number.isNaN(Date.parse(value))
}

function validateReviewInput(input: Partial<ReviewInput>) {
  if ("title" in input && !input.title?.trim()) return "标题不能为空"
  if ("summary" in input && !input.summary?.trim()) return "简介不能为空"
  if ("cover_url" in input && !input.cover_url?.trim()) return "封面图 URL 不能为空"
  if (input.title && input.title.length > 120) return "标题不能超过 120 字符"
  if (input.title_ja && input.title_ja.length > 120) return "日文标题不能超过 120 字符"
  if (input.summary && input.summary.length > 500) return "简介不能超过 500 字符"
  if (input.summary_ja && input.summary_ja.length > 500) return "日文简介不能超过 500 字符"
  if (input.content && input.content.length > 10_000) return "详细内容不能超过 10000 字符"
  if (input.content_ja && input.content_ja.length > 10_000) return "日文详细内容不能超过 10000 字符"
  const tags = normalizeTags(input.tags)
  if (tags.length > 12 || tags.some((tag) => tag.length > 40)) return "标签最多 12 个，每个不超过 40 字符"
  if (input.cover_url && input.cover_url.length > 1000) return "封面图 URL 过长"
  if (input.source_url && input.source_url.length > 1000) return "来源链接过长"
  if (input.registration_url && input.registration_url.length > 1000) return "报名链接过长"
  if (input.cover_url && !isSafeImageUrl(input.cover_url)) return "封面图请使用站内路径、竹溪社 Storage 或 Unsplash 图片链接"
  if (input.gallery_urls?.some((url) => !isSafeImageUrl(url))) return "更多图片请使用站内路径、竹溪社 Storage 或 Unsplash 图片链接"
  if (input.source_url && !isSafeSourceUrl(input.source_url)) return "来源链接必须是 http 或 https"
  if (input.registration_url && !isSafeSourceUrl(input.registration_url)) return "报名链接必须是 http 或 https"
  if (!isValidDateTime(input.start_at) || !isValidDateTime(input.end_at)) return "活动时间格式无效"
  if (input.start_at && input.end_at && Date.parse(input.end_at) < Date.parse(input.start_at)) {
    return "结束时间不能早于开始时间"
  }
  if (input.status && !["draft", "published", "cancelled"].includes(input.status)) return "活动状态无效"
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

function revalidateReviewPaths() {
  revalidatePath("/reviews")
  revalidatePath("/admin/reviews")
  revalidatePath("/app/scripts")
  revalidatePath("/app/scripts/large")
}

function formatReviewDbError(error: { code?: string; message?: string }) {
  if (error.code === "PGRST205" || error.message?.includes("past_event_reviews")) {
    return "数据库未更新：请先应用 Player Activity V1 migration（20260717133954）"
  }
  return "操作失败"
}

export async function createPastEventReview(input: ReviewInput) {
  await requireAdmin()
  const validationError = validateReviewInput(input)
  if (validationError) return { error: validationError }

  const supabase = createAdminClient()
  const status = input.status ?? "draft"
  const { error } = await supabase.from("past_event_reviews").insert({
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
    status,
    // Player visibility and the legacy public website are intentionally
    // independent. A future Player activity only reaches /reviews when an
    // administrator explicitly opts in.
    is_published: input.is_published ?? false,
    sort_order: input.sort_order ?? 0,
    show_on_player_home: input.show_on_player_home ?? false,
    player_home_order: input.player_home_order ?? 0,
    pin_in_player_library: input.pin_in_player_library ?? false,
    player_library_order: input.player_library_order ?? 0,
  })

  if (error) {
    console.error("[createPastEventReview]", error)
    return { error: formatReviewDbError(error) }
  }
  revalidateReviewPaths()
  return { success: true }
}

export async function updatePastEventReview(id: string, input: Partial<ReviewInput>) {
  await requireAdmin()
  const validationError = validateReviewInput(input)
  if (validationError) return { error: validationError }

  const filtered: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED_UPDATE_FIELDS.has(key)) continue
    filtered[key] = Array.isArray(value)
      ? key === "tags" ? normalizeTags(value) : normalizeGalleryUrls(value)
      : typeof value === "string" ? value.trim() || null : value
  }
  if (Object.keys(filtered).length === 0) return { error: "无有效更新字段" }

  const supabase = createAdminClient()
  const { error } = await supabase.from("past_event_reviews").update(filtered).eq("id", id)

  if (error) {
    console.error("[updatePastEventReview]", error)
    return { error: formatReviewDbError(error) }
  }
  revalidateReviewPaths()
  return { success: true }
}

export async function deletePastEventReview(id: string) {
  await requireAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase.from("past_event_reviews").delete().eq("id", id)
  if (error) return { error: formatReviewDbError(error) }
  revalidateReviewPaths()
  return { success: true }
}

export async function togglePastEventReviewPublished(id: string, isPublished: boolean) {
  await requireAdmin()
  return updatePastEventReview(id, {
    is_published: isPublished,
  })
}
