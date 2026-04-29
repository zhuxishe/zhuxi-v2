"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { createAdminClient } from "@/lib/supabase/admin"

interface ReviewInput {
  title: string
  summary: string
  cover_url: string
  gallery_urls?: string[]
  source_url?: string
  event_date?: string
  is_published?: boolean
  sort_order?: number
}

const ALLOWED_UPDATE_FIELDS = new Set([
  "title",
  "summary",
  "cover_url",
  "gallery_urls",
  "source_url",
  "event_date",
  "is_published",
  "sort_order",
])

const UNSAFE_URL_CHARS = /[\u0000-\u001f"'<>\\]/

function normalizeUrl(value?: string) {
  return value?.trim() ?? ""
}

function isSafeImageUrl(value: string) {
  const url = normalizeUrl(value)
  if (!url || UNSAFE_URL_CHARS.test(url)) return false
  if (url.startsWith("/")) return !url.startsWith("//")

  try {
    return new URL(url).protocol === "https:"
  } catch {
    return false
  }
}

function isSafeSourceUrl(value: string) {
  const url = normalizeUrl(value)
  if (!url || UNSAFE_URL_CHARS.test(url)) return false

  try {
    return ["https:", "http:"].includes(new URL(url).protocol)
  } catch {
    return false
  }
}

function normalizeGalleryUrls(urls?: string[]) {
  return (urls ?? []).map((url) => url.trim()).filter(Boolean)
}

function validateReviewInput(input: Partial<ReviewInput>) {
  if ("title" in input && !input.title?.trim()) return "标题不能为空"
  if ("summary" in input && !input.summary?.trim()) return "简介不能为空"
  if ("cover_url" in input && !input.cover_url?.trim()) return "封面图 URL 不能为空"
  if (input.title && input.title.length > 120) return "标题不能超过 120 字符"
  if (input.summary && input.summary.length > 500) return "简介不能超过 500 字符"
  if (input.cover_url && input.cover_url.length > 1000) return "封面图 URL 过长"
  if (input.source_url && input.source_url.length > 1000) return "来源链接过长"
  if (input.cover_url && !isSafeImageUrl(input.cover_url)) return "封面图 URL 只能使用 https 或站内 / 路径"
  if (input.gallery_urls?.some((url) => !isSafeImageUrl(url))) return "更多图片 URL 只能使用 https 或站内 / 路径"
  if (input.source_url && !isSafeSourceUrl(input.source_url)) return "来源链接必须是 http 或 https"
  if (input.sort_order !== undefined && (input.sort_order < 0 || input.sort_order > 9999)) {
    return "排序值必须在 0-9999 之间"
  }
  return null
}

function revalidateReviewPaths() {
  revalidatePath("/reviews")
  revalidatePath("/admin/reviews")
}

function formatReviewDbError(error: { code?: string; message?: string }) {
  if (error.code === "PGRST205" || error.message?.includes("past_event_reviews")) {
    return "数据库未更新：请先应用 supabase/migrations/037_past_event_reviews.sql"
  }
  return "操作失败"
}

export async function createPastEventReview(input: ReviewInput) {
  await requireAdmin()
  const validationError = validateReviewInput(input)
  if (validationError) return { error: validationError }

  const supabase = createAdminClient()
  const { error } = await supabase.from("past_event_reviews").insert({
    title: input.title.trim(),
    summary: input.summary.trim(),
    cover_url: input.cover_url.trim(),
    gallery_urls: normalizeGalleryUrls(input.gallery_urls),
    source_url: input.source_url?.trim() || null,
    event_date: input.event_date || null,
    is_published: input.is_published ?? true,
    sort_order: input.sort_order ?? 0,
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
      ? normalizeGalleryUrls(value)
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
  return updatePastEventReview(id, { is_published: isPublished })
}
