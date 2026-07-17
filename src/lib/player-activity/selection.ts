import type {
  LargeActivitySections,
  LargeActivityStatus,
  LargeActivitySummary,
  PlayerActivityLocale,
  PlayerScriptSummary,
  SocialScriptSections,
} from "./types"

const LARGE_ORDER_FALLBACK = 9999

type DataRow = Record<string, unknown>

export function normalizePlayerActivityLocale(locale: string): PlayerActivityLocale {
  return locale === "ja" ? "ja" : "zh"
}

function text(row: DataRow, key: string): string | null {
  const value = row[key]
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function numberValue(row: DataRow, key: string, fallback = LARGE_ORDER_FALLBACK): number {
  const value = row[key]
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function booleanValue(row: DataRow, key: string, fallback = false): boolean {
  return typeof row[key] === "boolean" ? row[key] : fallback
}

function stringArray(row: DataRow, key: string): string[] {
  const value = row[key]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : []
}

function localizedText(row: DataRow, locale: PlayerActivityLocale, key: string): string | null {
  if (locale === "ja") return text(row, `${key}_ja`) ?? text(row, key)
  return text(row, key) ?? text(row, `${key}_ja`)
}

function resolveLargeStatus(row: DataRow): LargeActivityStatus {
  const status = text(row, "status")
  if (status === "published" || status === "cancelled" || status === "draft") return status
  return booleanValue(row, "is_published") ? "published" : "draft"
}

export function mapLargeActivityRow(
  raw: DataRow,
  locale: PlayerActivityLocale,
): LargeActivitySummary | null {
  const id = text(raw, "id")
  const title = localizedText(raw, locale, "title")
  if (!id || !title) return null

  const eventDate = text(raw, "event_date")
  const hasHomeFlag = Object.prototype.hasOwnProperty.call(raw, "show_on_player_home")
  const hasLibraryPin = Object.prototype.hasOwnProperty.call(raw, "pin_in_player_library")

  return {
    id,
    sourceKey: text(raw, "source_key"),
    title,
    summary: localizedText(raw, locale, "summary") ?? "",
    content: localizedText(raw, locale, "content"),
    coverUrl: text(raw, "cover_url"),
    galleryUrls: stringArray(raw, "gallery_urls"),
    startAt: text(raw, "start_at") ?? (eventDate ? `${eventDate}T00:00:00+09:00` : null),
    endAt: text(raw, "end_at"),
    eventDate,
    location: localizedText(raw, locale, "location"),
    feeNote: localizedText(raw, locale, "fee_note"),
    capacityNote: localizedText(raw, locale, "capacity_note"),
    registrationUrl: text(raw, "registration_url"),
    status: resolveLargeStatus(raw),
    tags: stringArray(raw, "tags"),
    showOnPlayerHome: hasHomeFlag
      ? booleanValue(raw, "show_on_player_home")
      : false,
    playerHomeOrder: numberValue(raw, "player_home_order"),
    pinInPlayerLibrary: hasLibraryPin
      ? booleanValue(raw, "pin_in_player_library")
      : false,
    playerLibraryOrder: numberValue(raw, "player_library_order", numberValue(raw, "sort_order")),
    createdAt: text(raw, "created_at"),
  }
}

export function mapPlayerScriptRow(
  raw: DataRow,
  locale: PlayerActivityLocale,
): PlayerScriptSummary | null {
  const id = text(raw, "id")
  const title = localizedText(raw, locale, "title")
  if (!id || !title) return null

  const isFeatured = booleanValue(raw, "is_featured")
  const hasSocialFlag = Object.prototype.hasOwnProperty.call(raw, "is_social_script")
  const hasHomeFlag = Object.prototype.hasOwnProperty.call(raw, "show_on_player_activity")
  const hasPinnedFlag = Object.prototype.hasOwnProperty.call(raw, "pin_in_social_library")

  return {
    id,
    title,
    author: text(raw, "author"),
    coverUrl: text(raw, "cover_url"),
    genreTags: stringArray(raw, "genre_tags"),
    playerCountMin: typeof raw.player_count_min === "number" ? raw.player_count_min : null,
    playerCountMax: typeof raw.player_count_max === "number" ? raw.player_count_max : null,
    durationMinutes: typeof raw.duration_minutes === "number" ? raw.duration_minutes : null,
    budget: text(raw, "budget"),
    location: text(raw, "location"),
    createdAt: text(raw, "created_at"),
    isFeatured,
    isSocialScript: hasSocialFlag ? booleanValue(raw, "is_social_script") : isFeatured,
    showOnPlayerActivity: hasHomeFlag ? booleanValue(raw, "show_on_player_activity") : isFeatured,
    playerActivityOrder: numberValue(raw, "player_activity_order"),
    pinInSocialLibrary: hasPinnedFlag ? booleanValue(raw, "pin_in_social_library") : isFeatured,
    socialLibraryOrder: numberValue(raw, "social_library_order"),
  }
}

function timestamp(activity: LargeActivitySummary): number | null {
  const raw = activity.startAt ?? activity.eventDate
  if (!raw) return null
  const value = Date.parse(raw)
  return Number.isNaN(value) ? null : value
}

export function isUpcomingLargeActivity(activity: LargeActivitySummary, now = new Date()): boolean {
  const endValue = activity.endAt ? Date.parse(activity.endAt) : Number.NaN
  if (!Number.isNaN(endValue)) return endValue >= now.getTime()

  const value = timestamp(activity)
  if (value == null) return false
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  return value >= startOfToday.getTime()
}

export function selectLargeActivitiesForHome(
  activities: LargeActivitySummary[],
  now = new Date(),
  limit = 2,
): LargeActivitySummary[] {
  const visible = activities.filter((activity) => activity.status === "published")
  const manual = visible
    .filter((activity) => activity.showOnPlayerHome)
    .sort((a, b) => a.playerHomeOrder - b.playerHomeOrder || compareNewest(a, b))
  const manualIds = new Set(manual.map((activity) => activity.id))
  const autoFill = visible
    .filter((activity) => !manualIds.has(activity.id))
    .sort((a, b) => compareAutomatic(a, b, now))

  return [...manual, ...autoFill].slice(0, Math.max(0, limit))
}

export function buildLargeActivitySections(
  activities: LargeActivitySummary[],
  now = new Date(),
): LargeActivitySections {
  const visible = activities.filter((activity) => activity.status !== "draft")
  return {
    upcoming: visible
      .filter((activity) => isUpcomingLargeActivity(activity, now))
      .sort((a, b) => compareLibrary(a, b, true)),
    latest: visible
      .filter((activity) => !isUpcomingLargeActivity(activity, now))
      .sort((a, b) => compareLibrary(a, b, false)),
  }
}

function compareAutomatic(a: LargeActivitySummary, b: LargeActivitySummary, now: Date): number {
  const aUpcoming = isUpcomingLargeActivity(a, now)
  const bUpcoming = isUpcomingLargeActivity(b, now)
  if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1
  const aTime = timestamp(a) ?? 0
  const bTime = timestamp(b) ?? 0
  return aUpcoming ? aTime - bTime : bTime - aTime
}

function compareLibrary(a: LargeActivitySummary, b: LargeActivitySummary, upcoming: boolean): number {
  if (a.pinInPlayerLibrary !== b.pinInPlayerLibrary) return a.pinInPlayerLibrary ? -1 : 1
  if (a.playerLibraryOrder !== b.playerLibraryOrder) return a.playerLibraryOrder - b.playerLibraryOrder
  const aTime = timestamp(a) ?? 0
  const bTime = timestamp(b) ?? 0
  return upcoming ? aTime - bTime : bTime - aTime
}

function compareNewest(a: LargeActivitySummary, b: LargeActivitySummary): number {
  const bTime = timestamp(b) ?? Date.parse(b.createdAt ?? "")
  const aTime = timestamp(a) ?? Date.parse(a.createdAt ?? "")
  return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime)
}

export function sortSocialScriptsForHome(
  scripts: PlayerScriptSummary[],
  limit: number,
): PlayerScriptSummary[] {
  const socialScripts = scripts.filter((script) => script.isSocialScript)
  const manual = socialScripts
    .filter((script) => script.showOnPlayerActivity)
    .sort((a, b) => a.playerActivityOrder - b.playerActivityOrder || compareScriptNewest(a, b))
  const manualIds = new Set(manual.map((script) => script.id))
  const autoFill = socialScripts
    .filter((script) => !manualIds.has(script.id))
    .sort((a, b) => {
      if (a.pinInSocialLibrary !== b.pinInSocialLibrary) return a.pinInSocialLibrary ? -1 : 1
      if (a.socialLibraryOrder !== b.socialLibraryOrder) return a.socialLibraryOrder - b.socialLibraryOrder
      return compareScriptNewest(a, b)
    })

  return [...manual, ...autoFill].slice(0, Math.max(1, limit))
}

export function buildSocialScriptSections(scripts: PlayerScriptSummary[]): SocialScriptSections {
  const socialScripts = scripts.filter((script) => script.isSocialScript)
  const pinned = socialScripts
    .filter((script) => script.pinInSocialLibrary)
    .sort((a, b) => a.socialLibraryOrder - b.socialLibraryOrder || compareScriptNewest(a, b))
  const pinnedIds = new Set(pinned.map((script) => script.id))
  return {
    pinned,
    more: socialScripts.filter((script) => !pinnedIds.has(script.id)).sort(compareScriptNewest),
  }
}

function compareScriptNewest(a: PlayerScriptSummary, b: PlayerScriptSummary): number {
  const bTime = Date.parse(b.createdAt ?? "")
  const aTime = Date.parse(a.createdAt ?? "")
  return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime)
}

export function filterPlayerScripts(
  scripts: PlayerScriptSummary[],
  search?: string,
  genre?: string,
): PlayerScriptSummary[] {
  const query = search?.trim().toLocaleLowerCase() ?? ""
  return scripts.filter((script) => {
    const matchesGenre = !genre || script.genreTags.includes(genre)
    if (!matchesGenre) return false
    if (!query) return true
    return [script.title, script.author ?? "", script.location ?? ""]
      .some((value) => value.toLocaleLowerCase().includes(query))
  })
}
