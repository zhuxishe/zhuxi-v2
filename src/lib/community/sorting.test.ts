import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { getCommunityTreeholeSortColumns, normalizeCommunityTreeholeSort } from "./sorting"

const likeSortMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260717151036_community_treehole_like_sort_index.sql"),
  "utf8",
)

describe("community treehole sorting", () => {
  it("accepts the three supported URL sort values and defaults invalid input to latest", () => {
    expect(normalizeCommunityTreeholeSort("latest")).toBe("latest")
    expect(normalizeCommunityTreeholeSort("discussed")).toBe("discussed")
    expect(normalizeCommunityTreeholeSort("liked")).toBe("liked")
    expect(normalizeCommunityTreeholeSort("unknown")).toBe("latest")
    expect(normalizeCommunityTreeholeSort(undefined)).toBe("latest")
  })

  it("keeps newest as the tie-breaker for heat and likes", () => {
    expect(getCommunityTreeholeSortColumns("latest")).toEqual(["published_at", "id"])
    expect(getCommunityTreeholeSortColumns("discussed")).toEqual(["comment_count", "published_at", "id"])
    expect(getCommunityTreeholeSortColumns("liked")).toEqual(["like_count", "published_at", "id"])
  })

  it("adds a partial database index that matches the likes feed ordering", () => {
    expect(likeSortMigration).toContain("(post_type, like_count DESC, published_at DESC, id DESC)")
    expect(likeSortMigration).toContain("WHERE status = 'published'")
  })
})
