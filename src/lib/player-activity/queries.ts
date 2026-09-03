import { sanitizePostgrestValue } from "@/lib/sanitize"
import { createClient } from "@/lib/supabase/server"
import {
  buildLargeActivitySections,
  buildSocialScriptSections,
  mapLargeActivityRow,
  mapPlayerScriptRow,
  normalizePlayerActivityLocale,
  selectLargeActivitiesForHome,
  sortSocialScriptsForHome,
} from "./selection"
import type {
  LargeActivitySummary,
  PlayerActivitySettings,
  PlayerScriptLibraryFilters,
  PlayerScriptLibraryPage,
  PlayerScriptSummary,
} from "./types"

const DEFAULT_LARGE_HOME_LIMIT = 2
const DEFAULT_SOCIAL_HOME_LIMIT = 5
const DEFAULT_LIBRARY_PAGE_SIZE = 24
const MAX_LIBRARY_PAGE_SIZE = 48

const LARGE_ACTIVITY_COLUMNS = "id, source_key, title, title_ja, summary, summary_ja, content, content_ja, cover_url, gallery_urls, start_at, end_at, event_date, location, location_ja, fee_note, fee_note_ja, capacity_note, capacity_note_ja, registration_url, registration_status, registration_deadline, registration_label, status, tags, show_on_player_home, player_home_order, pin_in_player_library, player_library_order, created_at" as const

export const PLAYER_SCRIPT_SUMMARY_COLUMNS = "id, title, title_ja, author, cover_url, genre_tags, player_count_min, player_count_max, duration_minutes, budget, location, created_at, is_featured, is_social_script, show_on_player_activity, player_activity_order, pin_in_social_library, social_library_order" as const

function clampHomeLimit(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value)
    ? Math.min(12, Math.max(0, value))
    : fallback
}

function positiveInteger(value: unknown, fallback: number, maximum = Number.MAX_SAFE_INTEGER) {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? Math.min(value, maximum)
    : fallback
}

function mapLargeRows(rows: unknown[] | null, locale: string): LargeActivitySummary[] {
  const normalizedLocale = normalizePlayerActivityLocale(locale)
  return (rows ?? [])
    .map((row) => mapLargeActivityRow(row as Record<string, unknown>, normalizedLocale))
    .filter((activity): activity is LargeActivitySummary => activity !== null)
}

function mapScriptRows(rows: unknown[] | null, locale: string): PlayerScriptSummary[] {
  const normalizedLocale = normalizePlayerActivityLocale(locale)
  return (rows ?? [])
    .map((row) => mapPlayerScriptRow(row as Record<string, unknown>, normalizedLocale))
    .filter((script): script is PlayerScriptSummary => script !== null)
}

export async function fetchPlayerActivitySettings(): Promise<PlayerActivitySettings> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("player_activity_settings")
    .select("large_activities_enabled, social_scripts_enabled, script_library_enabled, large_home_limit, social_home_limit")
    .eq("id", 1)
    .single()

  if (error) throw error
  return {
    largeActivitiesEnabled: data.large_activities_enabled,
    socialScriptsEnabled: data.social_scripts_enabled,
    scriptLibraryEnabled: data.script_library_enabled,
    largeHomeLimit: clampHomeLimit(data.large_home_limit, DEFAULT_LARGE_HOME_LIMIT),
    socialHomeLimit: clampHomeLimit(data.social_home_limit, DEFAULT_SOCIAL_HOME_LIMIT),
  }
}

async function fetchPlayerLargeActivities(locale: string): Promise<LargeActivitySummary[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("past_event_reviews")
    .select(LARGE_ACTIVITY_COLUMNS)
    .eq("is_player_visible", true)
    .is("archived_at", null)
    .in("status", ["published", "cancelled"])
    .order("player_library_order", { ascending: true })
    .order("start_at", { ascending: false, nullsFirst: false })
    .order("event_date", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })

  if (error) throw error
  return mapLargeRows(data, locale)
}

async function fetchPlayerLargeHomeActivities(
  locale: string,
  limit: number,
): Promise<LargeActivitySummary[]> {
  if (limit <= 0) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("past_event_reviews")
    .select(LARGE_ACTIVITY_COLUMNS)
    .eq("is_player_visible", true)
    .eq("show_on_player_home", true)
    .eq("status", "published")
    .is("archived_at", null)
    .order("player_home_order", { ascending: true })
    .order("event_date", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(limit)

  if (error) throw error
  return selectLargeActivitiesForHome(mapLargeRows(data, locale), new Date(), limit)
}

async function fetchPlayerScripts(
  locale: string,
  options: { socialOnly?: boolean; homeOnly?: boolean; limit?: number } = {},
): Promise<PlayerScriptSummary[]> {
  if (options.limit !== undefined && options.limit <= 0) return []
  const supabase = await createClient()
  let query = supabase
    .from("scripts")
    .select(PLAYER_SCRIPT_SUMMARY_COLUMNS)
    .eq("is_player_visible", true)
    .is("archived_at", null)

  if (options.socialOnly) query = query.eq("is_social_script", true)
  if (options.homeOnly) query = query.eq("show_on_player_activity", true)

  query = query
    .order(options.homeOnly ? "player_activity_order" : "social_library_order", { ascending: true })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })

  if (options.limit !== undefined) query = query.limit(options.limit)
  const { data, error } = await query
  if (error) throw error
  return mapScriptRows(data, locale)
}

export async function fetchPlayerActivityHub(
  locale: string,
  now = new Date(),
  options: { largeLimit?: number } = {},
) {
  const settings = await fetchPlayerActivitySettings()
  const requestedLargeLimit = options.largeLimit === undefined
    ? settings.largeHomeLimit
    : clampHomeLimit(options.largeLimit, settings.largeHomeLimit)
  const largeLimit = Math.min(requestedLargeLimit, settings.largeHomeLimit)

  const [largeActivities, socialScripts] = await Promise.all([
    settings.largeActivitiesEnabled
      ? fetchPlayerLargeHomeActivities(locale, largeLimit)
      : Promise.resolve([]),
    settings.socialScriptsEnabled
      ? fetchPlayerScripts(locale, {
        socialOnly: true,
        homeOnly: true,
        limit: settings.socialHomeLimit,
      })
      : Promise.resolve([]),
  ])

  return {
    settings,
    largeActivities: selectLargeActivitiesForHome(largeActivities, now, largeLimit),
    socialScripts: sortSocialScriptsForHome(socialScripts, settings.socialHomeLimit),
  }
}

export async function fetchPlayerLargeActivityLibrary(locale: string, now = new Date()) {
  const settings = await fetchPlayerActivitySettings()
  if (!settings.largeActivitiesEnabled) return null
  return buildLargeActivitySections(await fetchPlayerLargeActivities(locale), now)
}

export async function fetchPlayerLargeActivity(id: string, locale: string) {
  const settings = await fetchPlayerActivitySettings()
  if (!settings.largeActivitiesEnabled) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("past_event_reviews")
    .select(LARGE_ACTIVITY_COLUMNS)
    .eq("id", id)
    .eq("is_player_visible", true)
    .is("archived_at", null)
    .in("status", ["published", "cancelled"])
    .maybeSingle()

  if (error) throw error
  return data ? mapLargeRows([data], locale)[0] ?? null : null
}

export async function fetchPlayerSocialLibrary(locale: string) {
  const settings = await fetchPlayerActivitySettings()
  if (!settings.socialScriptsEnabled) return null
  return buildSocialScriptSections(await fetchPlayerScripts(locale, { socialOnly: true }))
}

export async function fetchPlayerScriptLibrary(
  locale: string,
  filters: PlayerScriptLibraryFilters = {},
): Promise<PlayerScriptLibraryPage | null> {
  const settings = await fetchPlayerActivitySettings()
  if (!settings.scriptLibraryEnabled) return null

  const page = positiveInteger(filters.page, 1)
  const pageSize = positiveInteger(filters.pageSize, DEFAULT_LIBRARY_PAGE_SIZE, MAX_LIBRARY_PAGE_SIZE)
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  const supabase = await createClient()
  let query = supabase
    .from("scripts")
    .select(PLAYER_SCRIPT_SUMMARY_COLUMNS, { count: "exact" })
    .eq("is_player_visible", true)
    .is("archived_at", null)

  const search = filters.search?.trim().slice(0, 80)
  if (search) {
    const safe = sanitizePostgrestValue(search)
    if (safe) query = query.or(`title.ilike.%${safe}%,author.ilike.%${safe}%,description.ilike.%${safe}%,location.ilike.%${safe}%`)
  }
  if (filters.genre) query = query.contains("genre_tags", [filters.genre])
  if (filters.headcount) {
    query = query
      .lte("player_count_min", filters.headcount)
      .gte("player_count_max", filters.headcount)
  }
  if (filters.duration) query = query.lte("duration_minutes", filters.duration)

  if (filters.sort === "recommended") {
    query = query
      .order("pin_in_social_library", { ascending: false })
      .order("social_library_order", { ascending: true })
  }
  query = query
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, to)

  const { data, error, count } = await query
  if (error) throw error
  const total = count ?? 0
  return {
    items: mapScriptRows(data, locale),
    total,
    page,
    pageSize,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  }
}
