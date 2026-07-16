import type { CommunityLocale } from "@/lib/community/types"

const FORMATTERS: Record<CommunityLocale, Intl.DateTimeFormat> = {
  zh: new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }),
  ja: new Intl.DateTimeFormat("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }),
}

const DATE_ONLY_FORMATTERS: Record<CommunityLocale, Intl.DateTimeFormat> = {
  zh: new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Tokyo",
  }),
  ja: new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Tokyo",
  }),
}

export function formatCommunityDate(
  value: string | null | undefined,
  locale: CommunityLocale,
  options: { dateOnly?: boolean } = {},
) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return (options.dateOnly ? DATE_ONLY_FORMATTERS[locale] : FORMATTERS[locale]).format(date)
}
