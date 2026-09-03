import type { Json } from "@/types/database.types"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { sanitizePostgrestValue } from "@/lib/sanitize"

export interface PastEventReview {
  id: string
  source_key: string | null
  title: string
  title_ja: string | null
  summary: string
  summary_ja: string | null
  content: string | null
  content_ja: string | null
  tags: string[]
  cover_url: string
  gallery_urls: string[]
  source_url: string | null
  event_date: string | null
  start_at: string | null
  end_at: string | null
  location: string | null
  location_ja: string | null
  fee_note: string | null
  fee_note_ja: string | null
  capacity_note: string | null
  capacity_note_ja: string | null
  registration_url: string | null
  registration_status: "open" | "closed" | "coming_soon" | "ended"
  registration_deadline: string | null
  registration_label: string | null
  status: string
  is_published: boolean
  is_player_visible: boolean
  sort_order: number
  show_on_player_home: boolean
  player_home_order: number
  pin_in_player_library: boolean
  player_library_order: number
  archived_at: string | null
  archived_by: string | null
  archive_reason: string | null
  audit_reason: string | null
  created_at: string
  updated_at: string
}

export type PastEventReviewPublic = Pick<
  PastEventReview,
  "id" | "title" | "summary" | "cover_url" | "gallery_urls" | "source_url" | "event_date"
> & {
  source_key?: string | null
  cover_layout?: "poster"
  cover_width?: number
  cover_height?: number
}

export interface PastEventReviewAdminState {
  reviews: PastEventReview[]
  setupRequired: boolean
  total: number
  page: number
  pageSize: number
}

export interface PastEventReviewAdminOptions {
  search?: string
  status?: "draft" | "published" | "cancelled"
  archived?: boolean
  page?: number
  pageSize?: number
}

export interface PastEventReviewsPublicState {
  reviews: PastEventReviewPublic[]
  sharedCatalogueReady: boolean
}

function normalizeGalleryUrls(value: Json | null): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function mapReview(row: Record<string, unknown>): PastEventReview {
  return { ...row, gallery_urls: normalizeGalleryUrls(row.gallery_urls as Json | null) } as PastEventReview
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null
}

function mapPublicReview(row: Record<string, unknown>, locale: string): PastEventReviewPublic {
  const review = mapReview(row)
  const titleJa = optionalString(row.title_ja)
  const summaryJa = optionalString(row.summary_ja)

  return {
    id: review.id,
    title: locale === "ja" && titleJa ? titleJa : review.title,
    summary: locale === "ja" && summaryJa ? summaryJa : review.summary,
    cover_url: review.cover_url,
    gallery_urls: review.gallery_urls,
    source_url: review.source_url,
    event_date: review.event_date,
    source_key: optionalString(row.source_key),
  }
}

function isMissingReviewsTable(error: { code?: string; message?: string }) {
  return error.code === "PGRST205" || error.message?.includes("past_event_reviews")
}

function isMissingPlayerActivitySchema(error: { code?: string; message?: string }) {
  return error.code === "PGRST205"
    || error.code === "PGRST204"
    || error.message?.includes("player_activity_settings")
}

const LEGACY_PUBLIC_REVIEW_COLUMNS: string = [
  "id",
  "title",
  "summary",
  "cover_url",
  "gallery_urls",
  "source_url",
  "event_date",
  "is_published",
  "sort_order",
  "created_at",
].join(",")

const SHARED_PUBLIC_REVIEW_COLUMNS: string = [
  LEGACY_PUBLIC_REVIEW_COLUMNS,
  "source_key",
  "title_ja",
  "summary_ja",
].join(",")

type ReviewQueryError = {
  code?: string
  message?: string
  details?: string
  hint?: string
}

export function isMissingSharedReviewColumns(error: ReviewQueryError): boolean {
  if (error.code === "42703" || error.code === "PGRST204") return true

  const text = [error.message, error.details, error.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase()

  return text.includes("column") && ["source_key", "title_ja", "summary_ja"].some((column) => text.includes(column))
}

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>

async function queryPublishedPastEventReviews(supabase: ServerSupabaseClient, columns: string) {
  return supabase
    .from("past_event_reviews")
    .select(columns)
    .eq("is_published", true)
    .is("archived_at", null)
    .order("sort_order", { ascending: true })
    .order("event_date", { ascending: false })
    .order("created_at", { ascending: false })
}

export async function fetchPublishedPastEventReviewsState(locale = "zh"): Promise<PastEventReviewsPublicState> {
  const supabase = await createClient()
  let result = await queryPublishedPastEventReviews(supabase, SHARED_PUBLIC_REVIEW_COLUMNS)
  let sharedCatalogueReady = true

  // During the Expand rollout, retry the older projection when only the shared
  // catalogue columns are missing. A successful empty database result stays
  // empty; the public page no longer resurrects bundled static reviews.
  if (result.error && isMissingSharedReviewColumns(result.error)) {
    sharedCatalogueReady = false
    result = await queryPublishedPastEventReviews(supabase, LEGACY_PUBLIC_REVIEW_COLUMNS)
  }

  if (result.error) return { reviews: [], sharedCatalogueReady: false }
  return {
    reviews: (result.data ?? []).map((row) => mapPublicReview(row as unknown as Record<string, unknown>, locale)),
    sharedCatalogueReady,
  }
}

export async function fetchPublishedPastEventReviews(locale = "zh"): Promise<PastEventReviewPublic[]> {
  return (await fetchPublishedPastEventReviewsState(locale)).reviews
}

export async function fetchPastEventReviewAdminState(
  options: PastEventReviewAdminOptions = {},
): Promise<PastEventReviewAdminState> {
  const supabase = createAdminClient()
  const requestedPage = Number.isSafeInteger(options.page) && (options.page ?? 0) > 0 ? options.page! : 1
  const pageSize = Number.isSafeInteger(options.pageSize) && (options.pageSize ?? 0) > 0
    ? Math.min(options.pageSize!, 100)
    : 20
  const from = (requestedPage - 1) * pageSize
  const to = from + pageSize - 1
  let query = supabase
    .from("past_event_reviews")
    .select("*", { count: "exact" })
    .order("sort_order", { ascending: true })
    .order("event_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to)

  query = options.archived
    ? query.not("archived_at", "is", null)
    : query.is("archived_at", null)
  if (options.status) query = query.eq("status", options.status)
  const search = sanitizePostgrestValue((options.search?.trim() ?? "").slice(0, 100))
  if (search) {
    query = query.or([
      `title.ilike.%${search}%`,
      `title_ja.ilike.%${search}%`,
      `summary.ilike.%${search}%`,
      `location.ilike.%${search}%`,
      `source_key.ilike.%${search}%`,
    ].join(","))
  }

  const [reviewsResult, settingsResult] = await Promise.all([
    query,
    supabase
      .from("player_activity_settings")
      .select("id")
      .eq("id", 1)
      .maybeSingle(),
  ])
  const { data, error } = reviewsResult

  if (error && (isMissingReviewsTable(error) || isMissingPlayerActivitySchema(error))) {
    return { reviews: [], setupRequired: true, total: 0, page: requestedPage, pageSize }
  }
  if (error) throw error
  if (settingsResult.error && isMissingPlayerActivitySchema(settingsResult.error)) {
    return {
      reviews: (data ?? []).map((row) => mapReview(row)),
      setupRequired: true,
      total: reviewsResult.count ?? 0,
      page: requestedPage,
      pageSize,
    }
  }
  if (settingsResult.error) throw settingsResult.error
  return {
    reviews: (data ?? []).map((row) => mapReview(row)),
    setupRequired: false,
    total: reviewsResult.count ?? 0,
    page: requestedPage,
    pageSize,
  }
}
