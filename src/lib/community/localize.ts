import type { CommunityLocale, LocalizedAnnouncement, LocalizedFaq } from "./types"

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

function complete(values: Array<string | null | undefined>) {
  return values.every((value) => Boolean(value?.trim()))
}

export function localizeAnnouncement(
  row: AnnouncementRow,
  locale: CommunityLocale,
): LocalizedAnnouncement | null {
  const preferred = locale === "ja"
    ? [row.title_ja, row.summary_ja, row.body_ja]
    : [row.title_zh, row.summary_zh, row.body_zh]
  const fallback = locale === "ja"
    ? [row.title_zh, row.summary_zh, row.body_zh]
    : [row.title_ja, row.summary_ja, row.body_ja]

  const useFallback = !complete(preferred)
  const selected = useFallback ? fallback : preferred
  if (!complete(selected)) return null

  const fallbackLocale = useFallback ? (locale === "ja" ? "zh" : "ja") : null
  const linkText = (useFallback
    ? (locale === "ja" ? row.link_text_zh : row.link_text_ja)
    : (locale === "ja" ? row.link_text_ja : row.link_text_zh))?.trim() || null

  return {
    id: row.id,
    title: selected[0]!.trim(),
    summary: selected[1]!.trim(),
    body: selected[2]!.trim(),
    publisherName: row.publisher_name,
    publishedAt: row.published_at,
    isPinned: row.is_pinned,
    linkUrl: row.link_url,
    linkText,
    fallbackLocale,
  }
}

export function localizeFaq(row: FaqRow, locale: CommunityLocale): LocalizedFaq | null {
  const preferred = locale === "ja"
    ? [row.question_ja, row.answer_ja]
    : [row.question_zh, row.answer_zh]
  const fallback = locale === "ja"
    ? [row.question_zh, row.answer_zh]
    : [row.question_ja, row.answer_ja]
  const useFallback = !complete(preferred)
  const selected = useFallback ? fallback : preferred
  if (!complete(selected)) return null

  return {
    id: row.id,
    question: selected[0]!.trim(),
    answer: selected[1]!.trim(),
    isFeatured: row.is_featured,
    fallbackLocale: useFallback ? (locale === "ja" ? "zh" : "ja") : null,
  }
}

export function normalizeCommunityLocale(locale: string): CommunityLocale {
  return locale.toLowerCase().startsWith("ja") ? "ja" : "zh"
}
