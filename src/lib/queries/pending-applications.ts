import { requireAdmin } from "@/lib/auth/admin"
import { memberApprovalBlockReason } from "@/lib/member-master/approval"
import { createAdminClient } from "@/lib/supabase/admin"
import type { MemberCenterRecord } from "@/types/member-center"
import type { IgnoredApplicationItem, IgnoredApplicationsPage, PendingApplicationItem, PendingApplicationsPage } from "@/types/pending-applications"

const PAGE_SIZE = 50
const IDENTITY_COLUMNS = "full_name,nickname,school_name,gender,age_range,nationality,current_city,hobby_tags,activity_type_tags,personality_self_tags"
const COLUMNS = `id,status,record_source,profile_stage,onboarding_step,submitted_at,created_at,updated_at,member_identity!inner(${IDENTITY_COLUMNS})`
type Client = ReturnType<typeof createAdminClient>
interface ApplicationRow {
  id: string
  status: string
  record_source: string
  profile_stage: string
  onboarding_step: number
  submitted_at: string | null
  created_at: string
  updated_at: string
  member_identity: MemberCenterRecord | MemberCenterRecord[]
}
interface ApplicationIgnoreRow {
  ignored_at: string
  actor_name: string
  reason: string
}
interface IgnoredApplicationRow extends ApplicationRow {
  application_ignore: ApplicationIgnoreRow | ApplicationIgnoreRow[]
}

/** Keep the dashboard count, list and mutation eligibility on the same scope. */
function applicationQuery(client: Client, columns: string, head = false, search = "", ignored = false) {
  const ignoreColumns = ignored
    ? "application_ignore:member_application_ignores!inner(ignored_at,actor_name,reason)"
    : "application_ignore:member_application_ignores(member_id)"
  let query = client.from("members").select(`${columns},${ignoreColumns}`, { count: "exact", head })
    .eq("record_scope", "current").eq("account_status", "active").eq("status", "pending")
    .in("profile_stage", ["submitted", "complete"]).eq("onboarding_step", 4)
  // An embedded null filter is a database-side anti-join, including for HEAD counts.
  if (!ignored) query = query.is("application_ignore", null)
  if (search) {
    // PostgREST treats * as a LIKE alias, so use an escaped literal regex for it.
    const operator = search.includes("*") ? "imatch" : "ilike"
    const pattern = operator === "imatch"
      ? search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      : `%${search.replace(/[\\%_]/g, "\\$&")}%`
    const quoted = `"${pattern.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
    query = query.or(["full_name", "nickname", "school_name"].map((column) => `${column}.${operator}.${quoted}`).join(","), { referencedTable: "member_identity" })
  }
  return query
}

function pendingQuery(client: Client, columns: string, head = false, search = "") {
  return applicationQuery(client, columns, head, search)
}

function displayText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function toItem(row: ApplicationRow): PendingApplicationItem {
  const identity = Array.isArray(row.member_identity) ? row.member_identity[0] ?? null : row.member_identity
  return {
    id: row.id,
    fullName: displayText(identity?.full_name) ?? "未填写姓名",
    nickname: displayText(identity?.nickname),
    schoolName: displayText(identity?.school_name),
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    blockReason: memberApprovalBlockReason({
      member: { status: row.status, recordSource: row.record_source, profileStage: row.profile_stage, onboardingStep: row.onboarding_step },
      identity,
    }),
  }
}

function toIgnoredItem(row: IgnoredApplicationRow): IgnoredApplicationItem {
  const ignored = Array.isArray(row.application_ignore) ? row.application_ignore[0] : row.application_ignore
  if (!ignored) throw new Error("无法读取已忽略申请，请刷新后重试")
  return { ...toItem(row), ignoredAt: ignored.ignored_at, ignoredByName: ignored.actor_name, ignoreReason: ignored.reason }
}

async function countPending(client: Client, search = "") {
  const { count, error } = await pendingQuery(client, "id,member_identity!inner(id)", true, search)
  if (error) throw new Error("无法读取待处理申请，请刷新后重试")
  return count ?? 0
}

export async function fetchPendingApplicationCount(): Promise<number> {
  await requireAdmin()
  return countPending(createAdminClient())
}

export async function fetchPendingApplications(input: { search?: string; page?: number } = {}): Promise<PendingApplicationsPage> {
  await requireAdmin()
  const client = createAdminClient()
  const search = (input.search ?? "").trim().slice(0, 100)
  const total = await countPending(client, search)
  const requestedPage = Number.isSafeInteger(input.page) && input.page! > 0 ? input.page! : 1
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / PAGE_SIZE)))
  if (total === 0) return { items: [], total, page, pageSize: PAGE_SIZE }
  const { data, error } = await pendingQuery(client, COLUMNS, false, search)
    .order("submitted_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true }).order("id", { ascending: true })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1).returns<ApplicationRow[]>()
  if (error) throw new Error("无法读取待处理申请，请刷新后重试")
  return { items: (data ?? []).map(toItem), total, page, pageSize: PAGE_SIZE }
}

export async function fetchIgnoredApplications(input: { search?: string; page?: number } = {}): Promise<IgnoredApplicationsPage> {
  await requireAdmin()
  const client = createAdminClient()
  const search = (input.search ?? "").trim().slice(0, 100)
  const { count, error: countError } = await applicationQuery(client, "id,member_identity!inner(id)", true, search, true)
  if (countError) throw new Error("无法读取已忽略申请，请刷新后重试")
  const total = count ?? 0
  const requestedPage = Number.isSafeInteger(input.page) && input.page! > 0 ? input.page! : 1
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / PAGE_SIZE)))
  if (total === 0) return { items: [], total, page, pageSize: PAGE_SIZE }
  const { data, error } = await applicationQuery(client, COLUMNS, false, search, true)
    // member_id is both PK and FK, so PostgREST supports ordering parents by this to-one relation.
    .order("application_ignore(ignored_at)", { ascending: false }).order("id", { ascending: true })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1).returns<IgnoredApplicationRow[]>()
  if (error) throw new Error("无法读取已忽略申请，请刷新后重试")
  return { items: (data ?? []).map(toIgnoredItem), total, page, pageSize: PAGE_SIZE }
}

/** Re-read a single current candidate immediately before its versioned approval. */
export async function fetchPendingApplicationForApproval(memberId: string): Promise<PendingApplicationItem | null> {
  await requireAdmin()
  const { data, error } = await pendingQuery(createAdminClient(), COLUMNS)
    .eq("id", memberId).returns<ApplicationRow[]>().maybeSingle()
  if (error) throw new Error("无法读取待处理申请，请刷新后重试")
  return data ? toItem(data) : null
}
