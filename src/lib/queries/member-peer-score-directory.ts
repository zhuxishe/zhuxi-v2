import { requireSuperAdmin } from "@/lib/auth/admin"
import { createClient } from "@/lib/supabase/server"
import { normalizePeerScoreDirectoryControls, PEER_SCORE_DIRECTORY_SORTS, PEER_SCORE_DIRECTORY_STATUSES, isPeerScoreDirectoryDirection, type PeerScoreDirectorySearchParams } from "@/lib/member-master/peer-score-directory-controls"
import type { MemberPeerScoreDirectory, MemberPeerScoreDirectoryResult, PeerScoreDirectoryMember } from "@/types/member-peer-score-directory"

const RPC_NAME = "admin_list_member_peer_scores"
const PAGE_SIZE = 30
const INVALID_DATA = "合拍分数名单数据格式无效"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface DirectoryRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{
    data: unknown
    error: { code?: string; message: string } | null
  }>
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(INVALID_DATA)
  return value as Record<string, unknown>
}
function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(INVALID_DATA)
  return value
}
function nullableText(value: unknown): string | null {
  if (value !== null && typeof value !== "string") throw new Error(INVALID_DATA)
  return value
}

function member(value: unknown, canViewNumber: boolean): PeerScoreDirectoryMember {
  const item = record(value)
  if (typeof item.member_id !== "string" || !UUID.test(item.member_id) || typeof item.full_name !== "string" || !item.full_name.trim()
    || (item.score !== null && (typeof item.score !== "number" || !Number.isFinite(item.score) || item.score < 1 || item.score > 5))
    || !["ready", "accumulating", "unrated"].includes(String(item.sample_status))) throw new Error(INVALID_DATA)
  const result: PeerScoreDirectoryMember = {
    memberId: item.member_id, memberNumber: nullableText(item.member_number), fullName: item.full_name, nickname: nullableText(item.nickname),
    score: item.score as number | null, reviewerCount: count(item.reviewer_count), activityCount: count(item.activity_count),
    reviewCount: count(item.review_count), latestReviewAt: nullableText(item.latest_review_at), sampleStatus: item.sample_status as PeerScoreDirectoryMember["sampleStatus"],
  }
  if ((!canViewNumber && result.memberNumber !== null) || result.reviewerCount > result.reviewCount || result.activityCount > result.reviewCount
    || (result.latestReviewAt !== null && !Number.isFinite(Date.parse(result.latestReviewAt)))) throw new Error(INVALID_DATA)
  if (result.score === null) {
    if (result.reviewCount !== 0 || result.reviewerCount !== 0 || result.activityCount !== 0 || result.latestReviewAt !== null || result.sampleStatus !== "unrated") throw new Error(INVALID_DATA)
  } else if (result.reviewCount === 0 || result.reviewerCount === 0 || result.activityCount === 0 || result.latestReviewAt === null
    || result.sampleStatus !== (result.reviewerCount >= 2 && result.activityCount >= 3 ? "ready" : "accumulating")) throw new Error(INVALID_DATA)
  return result
}

export function normalizeMemberPeerScoreDirectory(value: unknown, canViewMemberNumber: boolean): MemberPeerScoreDirectory {
  const data = record(value)
  const sort = PEER_SCORE_DIRECTORY_SORTS.find((item) => item.value === data.sort)?.value
  const sampleStatus = PEER_SCORE_DIRECTORY_STATUSES.find((item) => item.value === data.sample_status)?.value
  if (!Array.isArray(data.members) || typeof data.can_view_member_number !== "boolean" || !sort || !sampleStatus
    || !isPeerScoreDirectoryDirection(data.direction) || (data.can_view_member_number && !canViewMemberNumber)) throw new Error(INVALID_DATA)
  const total = count(data.total), page = count(data.page), pageSize = count(data.page_size)
  if (page < 1 || page > 1_000_000 || pageSize < 1 || pageSize > 100 || data.members.length > pageSize || data.members.length > total) throw new Error(INVALID_DATA)
  const expectedLength = Math.max(0, Math.min(pageSize, total - (page - 1) * pageSize))
  if (data.members.length !== expectedLength) throw new Error(INVALID_DATA)
  const members = data.members.map((item) => member(item, data.can_view_member_number as boolean))
  if (new Set(members.map((item) => item.memberId)).size !== members.length) throw new Error(INVALID_DATA)
  if (sampleStatus !== "all" && members.some((item) => item.sampleStatus !== sampleStatus)) throw new Error(INVALID_DATA)
  return { members, total, page, pageSize, sort, direction: data.direction, sampleStatus, canViewMemberNumber: data.can_view_member_number }
}

export async function fetchMemberPeerScoreDirectory(input: PeerScoreDirectorySearchParams = {}): Promise<MemberPeerScoreDirectoryResult> {
  const admin = await requireSuperAdmin()
  const controls = normalizePeerScoreDirectoryControls(input)
  const client = await createClient() as unknown as DirectoryRpcClient
  async function readPage(page: number): Promise<MemberPeerScoreDirectoryResult> {
    const { data, error } = await client.rpc(RPC_NAME, {
      p_search: controls.search, p_page: page, p_page_size: PAGE_SIZE,
      p_sort: controls.sort, p_direction: controls.direction, p_sample_status: controls.status,
    })
    if (error) {
      if (["PGRST202", "42883"].includes(error.code ?? "") && error.message.includes(RPC_NAME)) return { status: "unavailable" }
      throw new Error(`合拍分数名单读取失败：${error.message}`)
    }
    return { status: "ready", data: normalizeMemberPeerScoreDirectory(data, admin.role === "super_admin") }
  }
  const result = await readPage(controls.page)
  if (result.status === "ready") {
    const lastPage = Math.max(1, Math.ceil(result.data.total / result.data.pageSize))
    // A bookmark may outlive the matching results. Correct it with one bounded
    // read; do not manufacture an empty roster for a page beyond the last page.
    if (result.data.page > lastPage) return readPage(lastPage)
  }
  return result
}
