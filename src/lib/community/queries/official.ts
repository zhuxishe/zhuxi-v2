import { createAdminClient } from "@/lib/supabase/admin"
import { localizeAnnouncement, localizeFaq } from "@/lib/community/localize"
import type { CommunityLocale, LocalizedAnnouncement, LocalizedFaq } from "@/lib/community/types"

interface AnnouncementRow {
  id: string
  title_zh: string | null
  summary_zh: string | null
  body_zh: string | null
  title_ja: string | null
  summary_ja: string | null
  body_ja: string | null
  publisher_name: string
  published_at: string | null
  is_pinned: boolean
  link_url: string | null
  link_text_zh: string | null
  link_text_ja: string | null
}

interface FaqRow {
  id: string
  question_zh: string | null
  answer_zh: string | null
  question_ja: string | null
  answer_ja: string | null
  is_featured: boolean
}

export async function fetchPublishedAnnouncements(
  locale: CommunityLocale,
  options: { limit?: number; pinnedOnly?: boolean } = {},
): Promise<LocalizedAnnouncement[]> {
  const db = createAdminClient()
  const now = new Date().toISOString()
  let query = db
    .from("community_announcements")
    .select("id, title_zh, summary_zh, body_zh, title_ja, summary_ja, body_ja, publisher_name, published_at, is_pinned, link_url, link_text_zh, link_text_ja")
    .eq("status", "published")
    .or(`display_start_at.is.null,display_start_at.lte.${now}`)
    .or(`display_end_at.is.null,display_end_at.gt.${now}`)
    .order("is_pinned", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("published_at", { ascending: false })

  if (options.pinnedOnly) query = query.eq("is_pinned", true)
  if (options.limit) query = query.limit(options.limit)

  const { data, error } = await query
  if (error) throw new Error(`Failed to load community announcements: ${error.message}`)
  return ((data ?? []) as AnnouncementRow[])
    .map((row) => localizeAnnouncement(row, locale))
    .filter((item): item is LocalizedAnnouncement => Boolean(item))
}

export async function fetchPublishedFaqs(
  locale: CommunityLocale,
  options: { limit?: number; featuredOnly?: boolean } = {},
): Promise<LocalizedFaq[]> {
  const db = createAdminClient()
  let query = db
    .from("community_faqs")
    .select("id, question_zh, answer_zh, question_ja, answer_ja, is_featured")
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .order("published_at", { ascending: false })

  if (options.featuredOnly) query = query.eq("is_featured", true)
  if (options.limit) query = query.limit(options.limit)

  const { data, error } = await query
  if (error) throw new Error(`Failed to load community FAQs: ${error.message}`)
  return ((data ?? []) as FaqRow[])
    .map((row) => localizeFaq(row, locale))
    .filter((item): item is LocalizedFaq => Boolean(item))
}
