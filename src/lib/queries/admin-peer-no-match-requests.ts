import { requireAdmin } from "@/lib/auth/admin"
import { createClient } from "@/lib/supabase/server"
import { isPeerNoMatchUuid, normalizePeerNoMatchFilter, normalizePeerNoMatchPage } from "@/lib/peer-no-match/admin-validation"
import type { AdminPeerNoMatchRequest, AdminPeerNoMatchRequestsPage, AdminPeerNoMatchRequestsResult, PeerNoMatchRequestFilter } from "@/lib/peer-no-match/admin-types"

const RPC_NAME = "admin_list_peer_no_match_requests"
const INVALID_DATA = "不再配对申请数据格式无效"

export interface PeerNoMatchAdminRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(INVALID_DATA)
  return value as Record<string, unknown>
}
function text(value: unknown): string {
  if (typeof value !== "string") throw new Error(INVALID_DATA)
  return value
}
function nullableText(value: unknown): string | null { return value === null ? null : text(value) }
function date(value: unknown): string {
  const result = text(value)
  if (!Number.isFinite(Date.parse(result))) throw new Error(INVALID_DATA)
  return result
}
function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(INVALID_DATA)
  return value
}

export function normalizeAdminPeerNoMatchRequest(value: unknown): AdminPeerNoMatchRequest {
  const item = record(value)
  if (![item.id, item.round_id, item.requester_id, item.target_member_id].every(isPeerNoMatchUuid)
    || !["pending", "resolved", "closed"].includes(String(item.status))) throw new Error(INVALID_DATA)
  const result: AdminPeerNoMatchRequest = {
    id: item.id as string, roundId: item.round_id as string, roundName: text(item.round_name),
    requesterId: item.requester_id as string, requesterName: text(item.requester_name),
    targetMemberId: item.target_member_id as string, targetName: text(item.target_name), reason: text(item.reason),
    status: item.status as AdminPeerNoMatchRequest["status"], version: count(item.version),
    createdAt: date(item.created_at), updatedAt: date(item.updated_at),
    processedAt: item.processed_at === null ? null : date(item.processed_at), processedByName: nullableText(item.processed_by_name),
    internalNote: nullableText(item.internal_note), processingReason: nullableText(item.processing_reason),
  }
  if (result.version < 1 || result.requesterId === result.targetMemberId
    || (result.status === "pending" && (result.processedAt !== null || result.processedByName !== null || result.internalNote !== null || result.processingReason !== null))
    || (result.status !== "pending" && (result.processedAt === null || !result.internalNote?.trim() || !result.processingReason?.trim()))) throw new Error(INVALID_DATA)
  return result
}

function normalizePage(value: unknown): AdminPeerNoMatchRequestsPage {
  const data = record(value)
  if (!Array.isArray(data.requests)) throw new Error(INVALID_DATA)
  const total = count(data.total), page = count(data.page), pageSize = count(data.page_size)
  if (page < 1 || page > 1_000_000 || pageSize < 1 || pageSize > 100
    || data.requests.length !== Math.max(0, Math.min(pageSize, total - (page - 1) * pageSize))) throw new Error(INVALID_DATA)
  const requests = data.requests.map(normalizeAdminPeerNoMatchRequest)
  if (new Set(requests.map((item) => item.id)).size !== requests.length) throw new Error(INVALID_DATA)
  return { requests, total, page, pageSize }
}

export async function fetchAdminPeerNoMatchRequests(input: { status?: PeerNoMatchRequestFilter; page?: number } = {}): Promise<AdminPeerNoMatchRequestsResult> {
  await requireAdmin()
  const client = await createClient() as unknown as PeerNoMatchAdminRpcClient
  const status = normalizePeerNoMatchFilter(input.status)
  async function readPage(page: number): Promise<AdminPeerNoMatchRequestsResult> {
    const { data, error } = await client.rpc(RPC_NAME, { p_status: status, p_page: page, p_page_size: 30 })
    if (error) {
      if (["PGRST202", "42883"].includes(error.code ?? "") && error.message.includes(RPC_NAME)) return { status: "unavailable" }
      throw new Error("不再配对申请读取失败", { cause: error })
    }
    const result = normalizePage(data)
    if (status !== "all" && result.requests.some((item) => item.status !== status)) throw new Error(INVALID_DATA)
    return { status: "ready", data: result }
  }
  const result = await readPage(normalizePeerNoMatchPage(input.page))
  if (result.status === "ready") {
    const lastPage = Math.max(1, Math.ceil(result.data.total / result.data.pageSize))
    if (result.data.page > lastPage) return readPage(lastPage)
  }
  return result
}
