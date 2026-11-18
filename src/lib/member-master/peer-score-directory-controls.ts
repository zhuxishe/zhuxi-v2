import type { PeerScoreDirectoryControls, PeerScoreDirectoryDirection, PeerScoreDirectorySort, PeerScoreDirectoryStatus, PeerScoreSampleStatus } from "@/types/member-peer-score-directory"

export const PEER_SCORE_STATUS_LABELS: Record<PeerScoreSampleStatus, string> = {
  ready: "样本达标", accumulating: "积累中", unrated: "暂无有效评分",
}
export const PEER_SCORE_DIRECTORY_STATUSES: Array<{ value: PeerScoreDirectoryStatus; label: string }> = [
  { value: "all", label: "全部成员" },
  { value: "ready", label: "样本达标" },
  { value: "accumulating", label: "积累中" },
  { value: "unrated", label: "暂无有效评分" },
]
export const PEER_SCORE_DIRECTORY_SORTS: Array<{ value: PeerScoreDirectorySort; label: string }> = [
  { value: "latest_review_at", label: "最近收到评分" },
  { value: "score", label: "合拍分数" },
  { value: "reviewer_count", label: "不同评价人数" },
]

export type PeerScoreDirectorySearchParams = Partial<Record<"search" | "status" | "sort" | "direction" | "page", string | string[]>>
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value

export function normalizePeerScoreDirectoryControls(input: PeerScoreDirectorySearchParams = {}): PeerScoreDirectoryControls {
  const requestedPage = first(input.page) ?? ""
  const page = /^\d+$/.test(requestedPage) ? Number(requestedPage) : 1
  return {
    search: Array.from((first(input.search) ?? "").trim()).slice(0, 100).join(""),
    status: PEER_SCORE_DIRECTORY_STATUSES.find((item) => item.value === first(input.status))?.value ?? "all",
    sort: PEER_SCORE_DIRECTORY_SORTS.find((item) => item.value === first(input.sort))?.value ?? "latest_review_at",
    direction: first(input.direction) === "asc" ? "asc" : "desc",
    page: Number.isSafeInteger(page) && page > 0 ? Math.min(page, 1_000_000) : 1,
  }
}

export function peerScoreDirectoryHref(controls: PeerScoreDirectoryControls, page: number): string {
  const query = new URLSearchParams()
  if (controls.search) query.set("search", controls.search)
  if (controls.status !== "all") query.set("status", controls.status)
  if (controls.sort !== "latest_review_at") query.set("sort", controls.sort)
  if (controls.direction !== "desc") query.set("direction", controls.direction)
  if (page > 1) query.set("page", String(page))
  return `/admin/peer-scores${query.size ? `?${query}` : ""}`
}

export function isPeerScoreDirectoryDirection(value: unknown): value is PeerScoreDirectoryDirection {
  return value === "asc" || value === "desc"
}
