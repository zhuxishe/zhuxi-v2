import type { Json } from "@/types/database.types"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export interface PastEventReview {
  id: string
  title: string
  summary: string
  cover_url: string
  gallery_urls: string[]
  source_url: string | null
  event_date: string | null
  is_published: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export type PastEventReviewPublic = Pick<
  PastEventReview,
  "id" | "title" | "summary" | "cover_url" | "gallery_urls" | "source_url" | "event_date"
>

export interface PastEventReviewAdminState {
  reviews: PastEventReview[]
  setupRequired: boolean
}

function normalizeGalleryUrls(value: Json | null): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function mapReview(row: Record<string, unknown>): PastEventReview {
  return { ...row, gallery_urls: normalizeGalleryUrls(row.gallery_urls as Json | null) } as PastEventReview
}

function isMissingReviewsTable(error: { code?: string; message?: string }) {
  return error.code === "PGRST205" || error.message?.includes("past_event_reviews")
}

export async function fetchPublishedPastEventReviews(): Promise<PastEventReviewPublic[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("past_event_reviews")
    .select("*")
    .eq("is_published", true)
    .order("sort_order", { ascending: true })
    .order("event_date", { ascending: false })
    .order("created_at", { ascending: false })

  if (error) return []
  return (data ?? []).map((row) => mapReview(row as Record<string, unknown>))
}

export async function fetchPastEventReviewAdminState(): Promise<PastEventReviewAdminState> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("past_event_reviews")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("event_date", { ascending: false })

  if (error && isMissingReviewsTable(error)) return { reviews: [], setupRequired: true }
  if (error) throw error
  return { reviews: (data ?? []).map((row) => mapReview(row)), setupRequired: false }
}
