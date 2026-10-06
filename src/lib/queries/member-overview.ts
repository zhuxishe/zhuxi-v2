import { requireAdmin, requireSuperAdmin } from "@/lib/auth/admin"
import { createClient } from "@/lib/supabase/server"

export interface MemberOverviewMetrics {
  maleCount: number
  femaleCount: number
  legacyTotal: number
  legacyActivated: number
}

export type LegacyMemberStatusFilter = "all" | "activated" | "inactive" | "unverified"

export interface LegacyMemberStatusItem {
  fullName: string
  memberNumber: string
  memberId: string | null
  registered: boolean | null
  approved: boolean | null
  hasLoggedIn: boolean | null
  lastSignInAt: string | null
  accountStatus: string
  activated: boolean
}

export interface LegacyMemberStatusPage {
  items: LegacyMemberStatusItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  summary: { total: number; activated: number }
}

export interface LegacyMemberStatusInput {
  search?: string
  filter?: LegacyMemberStatusFilter
  page?: number
  pageSize?: number
}

interface OverviewRpcClient {
  rpc(name: "admin_member_dashboard_metrics"): PromiseLike<{ data: unknown; error: unknown }>
  rpc(name: "admin_legacy_member_status", args: {
    p_search: string | null
    p_filter: LegacyMemberStatusFilter
    p_page: number
    p_page_size: number
  }): PromiseLike<{ data: unknown; error: unknown }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function isNullableBoolean(value: unknown): value is boolean | null {
  return value === null || typeof value === "boolean"
}

function parseMetrics(value: unknown): MemberOverviewMetrics | null {
  if (!isRecord(value) || !isCount(value.male_count) || !isCount(value.female_count)
    || !isCount(value.legacy_total) || !isCount(value.legacy_activated)
    || value.legacy_activated > value.legacy_total) return null
  return {
    maleCount: value.male_count,
    femaleCount: value.female_count,
    legacyTotal: value.legacy_total,
    legacyActivated: value.legacy_activated,
  }
}

function parseItem(value: unknown): LegacyMemberStatusItem | null {
  if (!isRecord(value) || !isText(value.full_name) || !isText(value.member_number)
    || (value.member_id !== null && !isText(value.member_id))
    || !isNullableBoolean(value.registered) || !isNullableBoolean(value.approved)
    || !isNullableBoolean(value.has_logged_in) || !isText(value.account_status)
    || typeof value.activated !== "boolean"
    || (value.last_sign_in_at !== null && (!isText(value.last_sign_in_at)
      || !Number.isFinite(Date.parse(value.last_sign_in_at))))) return null
  return {
    fullName: value.full_name,
    memberNumber: value.member_number,
    memberId: value.member_id,
    registered: value.registered,
    approved: value.approved,
    hasLoggedIn: value.has_logged_in,
    lastSignInAt: value.last_sign_in_at,
    accountStatus: value.account_status,
    activated: value.activated,
  }
}

function parsePage(value: unknown): LegacyMemberStatusPage | null {
  if (!isRecord(value) || !Array.isArray(value.items) || !isCount(value.total)
    || !isCount(value.page) || value.page < 1 || !isCount(value.page_size)
    || value.page_size < 1 || value.page_size > 100 || !isCount(value.total_pages)
    || value.total_pages !== Math.ceil(value.total / value.page_size)
    || value.page > Math.max(1, value.total_pages) || value.items.length > value.page_size
    || value.items.length > value.total || !isRecord(value.summary)
    || !isCount(value.summary.total) || !isCount(value.summary.activated)
    || value.summary.activated > value.summary.total || value.total > value.summary.total) return null
  const items = value.items.map(parseItem)
  if (items.some((item) => item === null)) return null
  return {
    items: items as LegacyMemberStatusItem[],
    total: value.total,
    page: value.page,
    pageSize: value.page_size,
    totalPages: value.total_pages,
    summary: { total: value.summary.total, activated: value.summary.activated },
  }
}

/** Failure stays distinct from a legitimate zero count on the dashboard. */
export async function fetchMemberOverviewMetrics(): Promise<MemberOverviewMetrics | null> {
  await requireAdmin()
  try {
    const client = await createClient() as unknown as OverviewRpcClient
    const { data, error } = await client.rpc("admin_member_dashboard_metrics")
    const metrics = error ? null : parseMetrics(data)
    if (!metrics) console.error("[member-overview] dashboard metrics unavailable")
    return metrics
  } catch {
    console.error("[member-overview] dashboard metrics request failed")
    return null
  }
}

/** The session RPC repeats the super-admin boundary before returning roster PII. */
export async function fetchLegacyMemberStatus(input: LegacyMemberStatusInput = {}): Promise<LegacyMemberStatusPage> {
  await requireSuperAdmin()
  const search = (input.search ?? "").trim().slice(0, 100)
  const filter: LegacyMemberStatusFilter = ["all", "activated", "inactive", "unverified"].includes(input.filter ?? "")
    ? input.filter! : "all"
  const page = Number.isSafeInteger(input.page) && input.page! > 0 ? Math.min(input.page!, 100000) : 1
  const pageSize = Number.isSafeInteger(input.pageSize) && input.pageSize! > 0 ? Math.min(input.pageSize!, 100) : 50
  try {
    const client = await createClient() as unknown as OverviewRpcClient
    const { data, error } = await client.rpc("admin_legacy_member_status", {
      p_search: search || null,
      p_filter: filter,
      p_page: page,
      p_page_size: pageSize,
    })
    const result = error ? null : parsePage(data)
    if (result) return result
  } catch {
    console.error("[member-overview] legacy status request failed")
    throw new Error("无法读取老用户状态，请刷新后重试")
  }
  console.error("[member-overview] legacy status unavailable")
  throw new Error("无法读取老用户状态，请刷新后重试")
}
