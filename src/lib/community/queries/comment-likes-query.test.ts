import { createClient } from "@supabase/supabase-js"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ client: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.client }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }))
import { fetchCommunityPostDetail, fetchCommunityPosts } from "./posts"

const memberId = "viewer-member"
const post = {
  id: "post", post_type: "treehole", author_profile_id: null, title: "A post", body: "Body", is_anonymous: true,
  status: "published", like_count: 3, comment_count: 3, published_at: "2026-10-01T00:00:00Z", edited_at: null,
}
const root = {
  id: "root", post_id: "post", parent_comment_id: null as string | null, author_profile_id: null as string | null,
  is_anonymous_author: true, like_count: 5, like_version: 10, body: "Root", status: "published", removal_source: null as string | null,
  edited_at: null, created_at: "2026-10-01T01:00:00Z",
}
let comments: typeof root[]
let requests: URL[]
let likeRequests: { p_comment_ids: string[] }[]
let likesUnavailable: boolean
let previewsUnavailable: boolean
let likes: { comment_id: string; member_id: string }[]
let omittedSnapshot: string | null
let blockedProfiles: string[]

beforeEach(() => {
  vi.resetAllMocks()
  comments = [root, { ...root, id: "reply", parent_comment_id: "root", body: "Reply", like_count: 9, like_version: 15 }, { ...root, id: "second", like_count: 0, like_version: 0 }]
  requests = []; likeRequests = []; likesUnavailable = false; previewsUnavailable = false; omittedSnapshot = null; blockedProfiles = []
  likes = [{ comment_id: "reply", member_id: memberId }, { comment_id: "root", member_id: "another-member" }]
  mocks.client.mockReturnValue(createClient("https://comment-likes-test.invalid", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input)); requests.push(url)
      const table = url.pathname.split("/").at(-1)
      const params = url.searchParams
      if ((table === "community_get_comment_like_states" && likesUnavailable)
        || (table === "community_comments" && params.get("status") === "eq.published" && previewsUnavailable)) {
        return new Response(JSON.stringify({ message: "Permission denied", code: "42501" }), { status: 403 })
      }
      if (table === "community_get_comment_like_states") {
        const args = JSON.parse(String(init?.body)) as { p_comment_ids: string[] }
        likeRequests.push(args)
        const data = comments.filter((comment) => args.p_comment_ids.includes(comment.id) && comment.id !== omittedSnapshot
          && comment.status === "published" && comment.removal_source !== "admin"
          && (comment.is_anonymous_author || !blockedProfiles.includes(comment.author_profile_id ?? ""))
          && !comments.some((parent) => parent.id === comment.parent_comment_id && (parent.status === "hidden" || parent.removal_source === "admin"
            || (!parent.is_anonymous_author && blockedProfiles.includes(parent.author_profile_id ?? "")))))
          .map((comment) => ({ comment_id: comment.id, like_count: comment.like_count, like_version: comment.like_version,
            liked: likes.some((like) => like.comment_id === comment.id && like.member_id === memberId) }))
        return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } })
      }
      let data: Record<string, unknown>[] = table === "community_posts" ? [post]
        : table === "community_comments" ? comments
          : table === "community_blocks" ? blockedProfiles.map((profileId) => ({ blocker_member_id: memberId, blocked_profile_id: profileId }))
          : table === "community_comment_authors" ? comments.map((comment) => ({ comment_id: comment.id, member_id: "anonymous-owner" }))
              : table === "community_post_authors" ? [{ post_id: post.id, member_id: "anonymous-owner" }] : []
      for (const [key, filter] of params) {
        if (filter.startsWith("eq.")) data = data.filter((row) => row[key] === filter.slice(3))
        else if (filter.startsWith("in.(")) {
          const values = filter.slice(4, -1).split(",")
          data = data.filter((row) => values.includes(String(row[key])))
        } else if (filter === "is.null") data = data.filter((row) => row[key] === null)
      }
      const total = data.length
      if (init?.method === "HEAD") return new Response(null, { headers: { "content-range": `0-${Math.max(0, total - 1)}/${total}` } })
      if (params.has("limit")) data = data.slice(0, Number(params.get("limit")))
      return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } })
    } },
  }))
})

describe("comment like hydration with the Supabase request builder", () => {
  it("batches root comments and replies, scoping the lookup to the current member", async () => {
    const detail = await fetchCommunityPostDetail("post", memberId, 20)
    expect(detail?.comments[0]).toMatchObject({ id: "root", likeCount: 5, likeVersion: 10, likedByMe: false, author: null })
    expect(detail?.comments[0].replies?.[0]).toMatchObject({ id: "reply", likeCount: 9, likeVersion: 15, likedByMe: true, author: null })
    expect(detail?.comments[1]).toMatchObject({ id: "second", likeCount: 0, likedByMe: false })
    const queries = requests.filter((url) => url.pathname.endsWith("/community_get_comment_like_states"))
    expect(queries).toHaveLength(1)
    expect(likeRequests).toEqual([{ p_comment_ids: ["root", "second", "reply"] }])
    expect(requests.some((url) => url.pathname.endsWith("/community_comment_likes"))).toBe(false)
    expect(JSON.stringify(detail)).not.toContain("anonymous-owner")
    for (const query of requests.filter((url) => url.pathname.endsWith("/community_comments"))) {
      expect(query.searchParams.get("select")).toContain("like_count")
      expect(query.searchParams.get("select")).toContain("like_version")
    }
  })

  it("includes the notified reply's root and its exact like state outside the first page", async () => {
    comments.push({ ...root, id: "late-root" }, { ...root, id: "late-reply", parent_comment_id: "late-root", like_count: 12 })
    likes.push({ comment_id: "late-reply", member_id: memberId })
    const detail = await fetchCommunityPostDetail("post", memberId, 1, "late-reply")
    expect(detail?.hasMoreComments).toBe(true)
    expect(detail?.comments.find((comment) => comment.id === "late-root")?.replies?.[0])
      .toMatchObject({ id: "late-reply", likedByMe: true, likeCount: 12 })
    expect(likeRequests).toHaveLength(1)
  })

  it("fails visibly when the viewer's likes cannot be verified", async () => {
    likesUnavailable = true
    await expect(fetchCommunityPostDetail("post", memberId, 20)).rejects.toThrow("Failed to load comment likes")
  })

  it("does not turn a preview query failure into a falsely empty comments list", async () => {
    previewsUnavailable = true
    await expect(fetchCommunityPosts({ memberId, postType: "treehole", limit: 10 })).rejects.toThrow("Failed to load comment previews")
  })

  it("does not make a likes query for an empty thread", async () => {
    comments = []
    const detail = await fetchCommunityPostDetail("post", memberId, 20)
    expect(detail?.comments).toEqual([])
    expect(likeRequests).toHaveLength(0)
  })

  it("keeps feed previews free of additional viewer-like queries", async () => {
    const posts = await fetchCommunityPosts({ memberId, postType: "treehole", limit: 10 })
    expect(posts[0].commentsPreview[0]).toHaveProperty("likeCount")
    expect(likeRequests).toHaveLength(0)
  })

  it("fails closed when a readable published comment has no verified like snapshot", async () => {
    omittedSnapshot = "reply"
    await expect(fetchCommunityPostDetail("post", memberId, 20)).rejects.toThrow("Failed to verify comment like snapshot availability")
  })

  it("accepts unavailable snapshots for hidden roots and their disabled replies", async () => {
    comments[0] = { ...root, status: "hidden", removal_source: "admin" }
    const detail = await fetchCommunityPostDetail("post", memberId, 20)
    expect(detail?.comments[0].replies?.[0]).toMatchObject({ id: "reply", likeCount: 0, likeVersion: 0, likedByMe: false })
  })

  it("still verifies likes for published replies below an author-deleted root", async () => {
    comments[0] = { ...root, status: "deleted", removal_source: "author" }
    const detail = await fetchCommunityPostDetail("post", memberId, 20)
    expect(detail?.comments[0].replies?.[0]).toMatchObject({ id: "reply", likeCount: 9, likeVersion: 15, likedByMe: true })
  })

  it("omits replies under a blocked root instead of failing the entire post on their unavailable snapshots", async () => {
    comments[0] = { ...root, author_profile_id: "blocked-root-author", is_anonymous_author: false }
    comments[1] = { ...comments[1], author_profile_id: "visible-reply-author", is_anonymous_author: false }
    blockedProfiles = ["blocked-root-author"]
    const detail = await fetchCommunityPostDetail("post", memberId, 20)
    expect(detail?.comments.map((comment) => comment.id)).toEqual(["second"])
    expect(detail?.comments[0]).toMatchObject({ likeCount: 0, likeVersion: 0, likedByMe: false, replies: [] })
  })

  it("keeps each large-thread snapshot batch inside the RPC's 1000-id limit", async () => {
    comments = [root, ...Array.from({ length: 1001 }, (_, index) => ({ ...root, id: `reply-${index}`, parent_comment_id: "root" }))]
    const detail = await fetchCommunityPostDetail("post", memberId, 20)
    expect(detail?.comments[0].replies).toHaveLength(1001)
    expect(likeRequests.map((args) => args.p_comment_ids.length)).toEqual([1000, 2])
  })
})
