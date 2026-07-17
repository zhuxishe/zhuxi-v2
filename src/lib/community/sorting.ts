import type { CommunityTreeholeSort } from "@/lib/community/types"

type CommunityPostSortColumn = "comment_count" | "id" | "like_count" | "published_at"

const SORT_COLUMNS: Record<CommunityTreeholeSort, readonly CommunityPostSortColumn[]> = {
  latest: ["published_at", "id"],
  discussed: ["comment_count", "published_at", "id"],
  liked: ["like_count", "published_at", "id"],
}

export function normalizeCommunityTreeholeSort(value: string | undefined): CommunityTreeholeSort {
  return value === "discussed" || value === "liked" ? value : "latest"
}

export function getCommunityTreeholeSortColumns(sort: CommunityTreeholeSort | undefined) {
  return SORT_COLUMNS[sort ?? "latest"]
}
