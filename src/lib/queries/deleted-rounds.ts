import { requireAdmin } from "@/lib/auth/admin"
import { createClient } from "@/lib/supabase/server"

const PAGE_SIZE = 10
const MAX_PAGE = 100001

export interface DeletedRound {
  id: string
  roundName: string
  purpose: string
  activityStart: string
  activityEnd: string
  deletedAt: string
  deletedAdminEmail: string | null
  executorName: string | null
  reason: string | null
  legacy: boolean
}

export interface DeletedRoundPage {
  items: DeletedRound[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function nullableText(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}

function parseItem(value: unknown): DeletedRound | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.round_name !== "string"
    || typeof value.purpose !== "string" || typeof value.activity_start !== "string"
    || typeof value.activity_end !== "string" || typeof value.deleted_at !== "string"
    || !nullableText(value.deleted_admin_email) || !nullableText(value.executor_name)
    || !nullableText(value.reason) || typeof value.legacy !== "boolean") return null
  return {
    id: value.id, roundName: value.round_name, purpose: value.purpose,
    activityStart: value.activity_start, activityEnd: value.activity_end,
    deletedAt: value.deleted_at, deletedAdminEmail: value.deleted_admin_email,
    executorName: value.executor_name, reason: value.reason, legacy: value.legacy,
  }
}

/** The database repeats the super-admin boundary and returns only deletion metadata. */
export async function fetchDeletedRounds(rawPage: unknown = 1): Promise<DeletedRoundPage | null> {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return null
  const parsedPage = typeof rawPage === "string" && /^\d+$/.test(rawPage) ? Number(rawPage) : rawPage
  let page = typeof parsedPage === "number" && Number.isSafeInteger(parsedPage) && parsedPage > 0
    ? Math.min(parsedPage, MAX_PAGE) : 1
  const db = await createClient()

  async function read() {
    const { data, error } = await db.rpc("admin_list_deleted_match_rounds", { p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE })
    if (error || !isRecord(data) || !Number.isSafeInteger(data.total) || (data.total as number) < 0
      || !Array.isArray(data.items) || data.items.length > PAGE_SIZE) throw new Error("Unable to load deleted matching activities")
    const items = data.items.map(parseItem)
    if (items.some((item) => item === null)) throw new Error("Unable to load deleted matching activities")
    const total = data.total as number
    return { items: items as DeletedRound[], total, totalPages: Math.min(MAX_PAGE, Math.max(1, Math.ceil(total / PAGE_SIZE))) }
  }

  let result = await read()
  if (page > result.totalPages) {
    page = result.totalPages
    result = await read()
  }
  return { ...result, page, pageSize: PAGE_SIZE }
}
