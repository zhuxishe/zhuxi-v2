import {
  FALLBACK_HOMEPAGE_SCHOOL_STATS,
  parseHomepageSchoolStats,
  type HomepageSchoolStats,
  type HomepageSchoolStatsHistoryItem,
} from "@/lib/homepage-school-stats"
import { createClient } from "@/lib/supabase/server"
import { unstable_rethrow } from "next/navigation"

interface QueryError { code?: string; message?: string; details?: string; hint?: string }
interface QueryResult { data: unknown; error: QueryError | null; count?: number | null }
interface QueryBuilder extends PromiseLike<QueryResult> {
  eq(column: string, value: unknown): QueryBuilder
  lt(column: string, value: unknown): QueryBuilder
  order(column: string, options: { ascending: boolean }): QueryBuilder
  limit(count: number): QueryBuilder
  maybeSingle(): PromiseLike<QueryResult>
}
interface QueryClient {
  from(table: string): {
    select(columns: string, options?: { count: "exact" }): QueryBuilder
  }
}

export interface HomepageSchoolStatsAdminState {
  setupRequired: boolean
  stats: HomepageSchoolStats
  history: HomepageSchoolStatsHistoryItem[]
}

const STATS_COLUMNS = "total_members,total_schools,featured_schools,version,published_at"
const HISTORY_COLUMNS = `id,${STATS_COLUMNS},action,restored_from_version,published_by_name`
const HISTORY_PAGE_SIZE = 500

function fallbackStats(): HomepageSchoolStats {
  return {
    ...FALLBACK_HOMEPAGE_SCHOOL_STATS,
    featuredSchools: FALLBACK_HOMEPAGE_SCHOOL_STATS.featuredSchools.map((school) => ({ ...school })),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0
}

function parseHistoryItem(row: unknown): HomepageSchoolStatsHistoryItem | null {
  if (!isRecord(row)) return null
  const stats = parseHomepageSchoolStats(row)
  const action = row.action
  const restored = row.restored_from_version
  const publisher = row.published_by_name
  if (!stats || !isPositiveSafeInteger(row.id) || !["seed", "publish", "restore"].includes(action as string)) return null
  if (restored !== null && !isPositiveSafeInteger(restored)) return null
  if (typeof publisher !== "string" || publisher !== publisher.trim() || publisher.length < 1 || publisher.length > 120) return null
  return {
    ...stats,
    id: row.id,
    action: action as HomepageSchoolStatsHistoryItem["action"],
    restoredFromVersion: restored,
    publishedByName: publisher,
  }
}

function isMissingSchema(error: QueryError | null) {
  if (!error) return false
  if (["PGRST204", "PGRST205", "42P01"].includes(error.code ?? "")) return true
  const text = [error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase()
  return text.includes("homepage_school_stats") && /(does not exist|schema cache|could not find)/.test(text)
}

function asQueryClient(client: Awaited<ReturnType<typeof createClient>>): QueryClient {
  return client as unknown as QueryClient
}

async function fetchCompleteHistory(db: QueryClient): Promise<QueryResult> {
  const rows: unknown[] = []
  let beforeVersion: number | null = null
  let expectedTotal: number | null = null

  while (true) {
    let query = db.from("homepage_school_stats_history")
      .select(HISTORY_COLUMNS, { count: "exact" })
      .order("version", { ascending: false })
      .limit(HISTORY_PAGE_SIZE)
    if (beforeVersion !== null) query = query.lt("version", beforeVersion)

    const result = await query
    if (result.error || !Array.isArray(result.data)) return result
    if (expectedTotal === null && typeof result.count === "number") expectedTotal = result.count
    rows.push(...result.data)
    if (result.data.length === 0
      || (expectedTotal !== null && rows.length >= expectedTotal)
      || (expectedTotal === null && result.data.length < HISTORY_PAGE_SIZE)
    ) return { data: rows, error: null }

    const lastRow = result.data.at(-1)
    if (!isRecord(lastRow) || !isPositiveSafeInteger(lastRow.version)) {
      return { data: rows, error: null }
    }
    beforeVersion = lastRow.version
  }
}

export async function fetchHomepageSchoolStats(): Promise<HomepageSchoolStats> {
  try {
    const db = asQueryClient(await createClient())
    const { data, error } = await db.from("homepage_school_stats")
      .select(STATS_COLUMNS).eq("id", 1).maybeSingle()
    if (error) return fallbackStats()
    return parseHomepageSchoolStats(data) ?? fallbackStats()
  } catch (error) {
    unstable_rethrow(error)
    return fallbackStats()
  }
}

export async function getAdminHomepageSchoolStatsState(): Promise<HomepageSchoolStatsAdminState> {
  const db = asQueryClient(await createClient())
  const [statsResult, historyResult] = await Promise.all([
    db.from("homepage_school_stats").select(STATS_COLUMNS).eq("id", 1).maybeSingle(),
    fetchCompleteHistory(db),
  ])
  if (isMissingSchema(statsResult.error) || isMissingSchema(historyResult.error)) {
    return { setupRequired: true, stats: fallbackStats(), history: [] }
  }
  if (statsResult.error) throw statsResult.error
  if (historyResult.error) throw historyResult.error
  const stats = parseHomepageSchoolStats(statsResult.data)
  const rawHistory = historyResult.data
  if (!stats || !Array.isArray(rawHistory)) throw new Error("主页学校统计数据格式无效")
  const history = rawHistory.map(parseHistoryItem)
  if (history.some((item) => item === null)) throw new Error("主页学校统计历史格式无效")
  return { setupRequired: false, stats, history: history as HomepageSchoolStatsHistoryItem[] }
}
