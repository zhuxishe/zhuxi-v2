import { createClient } from "@/lib/supabase/server"
import { getLandingEventReviews } from "@/lib/landing-activity-photos"
import {
  buildLargeActivitySections,
  buildSocialScriptSections,
  filterPlayerScripts,
  mapLargeActivityRow,
  mapPlayerScriptRow,
  normalizePlayerActivityLocale,
  selectLargeActivitiesForHome,
  sortSocialScriptsForHome,
} from "./selection"
import type { LargeActivitySummary, PlayerScriptSummary } from "./types"

const DEFAULT_SOCIAL_HOME_LIMIT = 5
const MAX_LIBRARY_ITEMS = 200

export async function fetchPlayerLargeActivities(locale: string): Promise<LargeActivitySummary[]> {
  const supabase = await createClient()
  const [reviewsResult, settingsResult] = await Promise.all([
    supabase
      .from("past_event_reviews")
      .select("*")
      .order("event_date", { ascending: false })
      .limit(MAX_LIBRARY_ITEMS),
    supabase
      .from("player_activity_settings")
      .select("id")
      .eq("id", 1)
      .maybeSingle(),
  ])
  const { data, error } = reviewsResult

  const normalizedLocale = normalizePlayerActivityLocale(locale)
  const staticActivities = getLandingEventReviews(locale, "large")
    .map((review) => mapLargeActivityRow({
      ...review,
      source_key: review.id,
      status: "published",
      is_published: true,
    }, normalizedLocale))
    .filter((activity): activity is LargeActivitySummary => activity !== null)

  if (error) {
    console.warn("[player activity fallback]", error.message)
    return staticActivities
  }

  const databaseActivities = (data ?? [])
    .map((row) => mapLargeActivityRow(row as unknown as Record<string, unknown>, normalizedLocale))
    .filter((activity): activity is LargeActivitySummary => activity !== null)

  // Once the Player Activity migration exists, the database is authoritative.
  // This prevents a drafted or deleted migrated row from being resurrected by
  // the pre-migration static fallback.
  const sharedCatalogueReady = !settingsResult.error
    || databaseActivities.some((activity) => activity.sourceKey)
  if (sharedCatalogueReady) return databaseActivities

  // Before the migration, static website activities keep the Player page
  // useful. A matching database version still wins when both describe one row.
  const databaseKeys = new Set(databaseActivities.flatMap((activity) => (
    activity.sourceKey ? [activity.sourceKey, activity.id] : [activity.id]
  )))
  return [
    ...databaseActivities,
    ...staticActivities.filter((activity) => !databaseKeys.has(activity.sourceKey ?? activity.id)),
  ]
}

export async function fetchPlayerScripts(locale: string): Promise<PlayerScriptSummary[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("scripts")
    .select("*")
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .limit(MAX_LIBRARY_ITEMS)

  if (error) throw error
  const normalizedLocale = normalizePlayerActivityLocale(locale)
  return (data ?? [])
    .map((row) => mapPlayerScriptRow(row as unknown as Record<string, unknown>, normalizedLocale))
    .filter((script): script is PlayerScriptSummary => script !== null)
}

export async function fetchSocialHomeLimit(): Promise<number> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("player_activity_settings")
    .select("social_home_limit")
    .limit(1)
    .maybeSingle()

  if (error) return DEFAULT_SOCIAL_HOME_LIMIT
  const value = data?.social_home_limit
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? Math.min(value, 12)
    : DEFAULT_SOCIAL_HOME_LIMIT
}

export async function fetchPlayerActivityHub(locale: string, now = new Date()) {
  const [largeActivities, scripts, socialHomeLimit] = await Promise.all([
    fetchPlayerLargeActivities(locale),
    fetchPlayerScripts(locale),
    fetchSocialHomeLimit(),
  ])

  return {
    largeActivities: selectLargeActivitiesForHome(largeActivities, now, 2),
    socialScripts: sortSocialScriptsForHome(scripts, socialHomeLimit),
  }
}

export async function fetchPlayerLargeActivityLibrary(locale: string, now = new Date()) {
  return buildLargeActivitySections(await fetchPlayerLargeActivities(locale), now)
}

export async function fetchPlayerLargeActivity(id: string, locale: string) {
  const activities = await fetchPlayerLargeActivities(locale)
  return activities.find((activity) => activity.id === id && activity.status !== "draft") ?? null
}

export async function fetchPlayerSocialLibrary(locale: string) {
  return buildSocialScriptSections(await fetchPlayerScripts(locale))
}

export async function fetchPlayerScriptLibrary(
  locale: string,
  search?: string,
  genre?: string,
) {
  return filterPlayerScripts(await fetchPlayerScripts(locale), search, genre)
}
