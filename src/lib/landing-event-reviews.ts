import type { PastEventReviewPublic } from "@/lib/queries/past-event-reviews"

export type LandingEventReviewSourceKeys = Readonly<Record<string, readonly string[]>>

function normalizeSourceKey(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase()
  return normalized ? normalized : null
}

export function sortLandingEventReviewsByNewestFirst(
  reviews: PastEventReviewPublic[],
): PastEventReviewPublic[] {
  return reviews
    .map((review, index) => ({ review, index }))
    .sort((a, b) => {
      const dateA = a.review.event_date
      const dateB = b.review.event_date

      if (dateA && dateB && dateA !== dateB) return dateB.localeCompare(dateA)
      if (dateA && !dateB) return -1
      if (!dateA && dateB) return 1
      return a.index - b.index
    })
    .map(({ review }) => review)
}

function mergeMigratedReview(
  fallback: PastEventReviewPublic,
  migrated: PastEventReviewPublic,
): PastEventReviewPublic {
  const merged: PastEventReviewPublic = {
    ...fallback,
    ...migrated,
    // Keep the public anchor stable even though the migrated row has a UUID.
    id: fallback.id,
  }

  // These are presentation-only hints from the established landing data and
  // are intentionally not part of the shared activity editing contract.
  if (fallback.cover_layout) merged.cover_layout = fallback.cover_layout
  if (fallback.cover_width) merged.cover_width = fallback.cover_width
  if (fallback.cover_height) merged.cover_height = fallback.cover_height

  return merged
}

export function mergeLandingEventReviews(
  fallbackReviews: PastEventReviewPublic[],
  databaseReviews: PastEventReviewPublic[],
  fallbackSourceKeys: LandingEventReviewSourceKeys = {},
  sharedCatalogueReady = databaseReviews.some(
    (review) => normalizeSourceKey(review.source_key) !== null,
  ),
): PastEventReviewPublic[] {
  const databaseIndexByKey = new Map<string, number>()

  databaseReviews.forEach((review, index) => {
    for (const candidate of [review.source_key, review.id]) {
      const key = normalizeSourceKey(candidate)
      if (key && !databaseIndexByKey.has(key)) databaseIndexByKey.set(key, index)
    }
  })

  const consumedDatabaseIndexes = new Set<number>()
  const mergedFallbacks = fallbackReviews.flatMap((fallback) => {
    const configuredKeys = fallbackSourceKeys[fallback.id] ?? [fallback.id]
    const matchIndex = configuredKeys
      .map((candidate) => normalizeSourceKey(candidate))
      .filter((candidate): candidate is string => candidate !== null)
      .map((candidate) => databaseIndexByKey.get(candidate))
      .find((candidate): candidate is number => candidate !== undefined && !consumedDatabaseIndexes.has(candidate))

    if (matchIndex === undefined) return sharedCatalogueReady ? [] : [fallback]

    consumedDatabaseIndexes.add(matchIndex)
    return [mergeMigratedReview(fallback, databaseReviews[matchIndex])]
  })

  const unmatchedDatabaseReviews = databaseReviews.filter(
    (_, index) => !consumedDatabaseIndexes.has(index),
  )

  return sortLandingEventReviewsByNewestFirst([
    ...mergedFallbacks,
    ...unmatchedDatabaseReviews,
  ])
}
