import type { Json } from "@/types/database.types"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

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
  status: string
  is_published: boolean
  sort_order: number
  show_on_player_home: boolean
  player_home_order: number
  pin_in_player_library: boolean
  player_library_order: number
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
    .order("sort_order", { ascending: true })
    .order("event_date", { ascending: false })
    .order("created_at", { ascending: false })
}

export async function fetchPublishedPastEventReviewsState(locale = "zh"): Promise<PastEventReviewsPublicState> {
  const supabase = await createClient()
  let result = await queryPublishedPastEventReviews(supabase, SHARED_PUBLIC_REVIEW_COLUMNS)
  let sharedCatalogueReady = true

  // Deployments can serve the new app before the shared activity columns have
  // reached Supabase. Retry with the legacy projection so /reviews keeps its
  // existing database rows and static fallback instead of failing the page.
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

export async function fetchPastEventReviewAdminState(): Promise<PastEventReviewAdminState> {
  const supabase = createAdminClient()
  const [reviewsResult, settingsResult] = await Promise.all([
    supabase
      .from("past_event_reviews")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("event_date", { ascending: false }),
    supabase
      .from("player_activity_settings")
      .select("id")
      .eq("id", 1)
      .maybeSingle(),
  ])
  const { data, error } = reviewsResult

  if (error && isMissingReviewsTable(error)) return { reviews: [], setupRequired: true }
  if (error) throw error
  if (settingsResult.error && isMissingPlayerActivitySchema(settingsResult.error)) {
    return { reviews: (data ?? []).map((row) => mapReview(row)), setupRequired: true }
  }
  if (settingsResult.error) throw settingsResult.error
  return { reviews: (data ?? []).map((row) => mapReview(row)), setupRequired: false }
}
