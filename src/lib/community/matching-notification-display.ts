import type { CommunityLocale } from "@/lib/community/types"
import zh from "@/messages/zh.json"
import ja from "@/messages/ja.json"

const notificationKeys = {
  matching_submitted: "submitted",
  matching_published: "published",
  matching_unmatched: "unmatched",
  matching_withdrawn: "withdrawn",
  matching_cancelled: "cancelled",
} as const

/** Player-facing copy for saved notices; never uses internal session names or rewrites a receipt. */
export function matchingNotificationCopy(
  type: string,
  locale: CommunityLocale,
  round?: { round_name: string; title_ja: string | null },
): { title: string; body: string } | null {
  if (!Object.hasOwn(notificationKeys, type)) return null
  const key = notificationKeys[type as keyof typeof notificationKeys]
  const labels = (locale === "ja" ? ja : zh).matchingNotifications
  const name = locale === "ja" ? round?.title_ja?.trim() || round?.round_name : round?.round_name
  return {
    title: labels[`${key}Title`],
    body: name ? labels[`${key}NamedBody`].replace("{name}", () => name) : labels[`${key}Body`],
  }
}

export function matchingNotificationUnavailableCopy(locale: CommunityLocale, state: "stale" | "cancelled") {
  const labels = (locale === "ja" ? ja : zh).matchingNotifications
  return state === "cancelled"
    ? { body: labels.cancelledHintBody, hint: labels.cancelledHint }
    : { body: labels.staleBody, hint: labels.staleHint }
}
