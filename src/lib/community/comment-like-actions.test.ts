import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ requireWrite: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }))
vi.mock("@/lib/auth/community", () => ({
  requireCommunityWrite: mocks.requireWrite,
  requireCommunityAccess: vi.fn(),
  requireCommunityNotificationAccess: vi.fn(),
}))
vi.mock("@/lib/community/rpc", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/community/rpc")>(), callCommunityRpc: mocks.rpc,
}))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
import { setCommunityCommentLikeAction } from "@/app/app/community/actions"

const postId = "11000000-0000-4000-8000-000000000001"
const replyId = "22000000-0000-4000-8000-000000000002"

beforeEach(() => {
  vi.resetAllMocks()
  mocks.requireWrite.mockResolvedValue({ context: { memberId: "current-member" }, error: null })
  mocks.rpc.mockResolvedValue({ data: [{ liked: true, like_count: 8, like_version: 21 }], error: null })
})

describe("comment like action boundary", () => {
  it("uses the exact comment and desired state with authenticated identity, then returns the database count", async () => {
    expect(await setCommunityCommentLikeAction(replyId, postId, true)).toEqual({ success: true, liked: true, likeCount: 8, likeVersion: 21 })
    expect(mocks.requireWrite).toHaveBeenCalledOnce()
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("community_set_comment_like", { p_comment_id: replyId, p_liked: true })
    expect(mocks.revalidate).toHaveBeenCalledWith(`/app/community/treehole/${postId}`)
    expect(mocks.revalidate).toHaveBeenCalledWith(`/app/community/photos/${postId}`)
    expect(mocks.revalidate).toHaveBeenCalledWith("/app/community")
  })

  it("sends an explicit false to cancel rather than toggling a possibly stale state", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ liked: false, like_count: 4, like_version: 22 }], error: null })
    expect(await setCommunityCommentLikeAction(replyId, postId, false)).toEqual({ success: true, liked: false, likeCount: 4, likeVersion: 22 })
    expect(mocks.rpc).toHaveBeenCalledWith("community_set_comment_like", { p_comment_id: replyId, p_liked: false })
  })

  it("does not call the RPC for a member without write access", async () => {
    mocks.requireWrite.mockResolvedValue({ context: {}, error: "Muted" })
    expect(await setCommunityCommentLikeAction(replyId, postId, true)).toEqual({ success: false, error: "Muted" })
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it.each([
    ["invalid", postId, true], [replyId, "../../admin", true], [replyId, postId, "true"], [null, postId, true],
  ])("rejects malformed identifiers and non-boolean desired states", async (comment, post, liked) => {
    const response = await setCommunityCommentLikeAction(comment as string, post as string, liked as boolean)
    expect(response.success).toBe(false)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it("returns a safe error without invalidating caches when the RPC rejects", async () => {
    mocks.rpc.mockRejectedValue(new Error("sensitive network details"))
    const response = await setCommunityCommentLikeAction(replyId, postId, true)
    expect(response).toEqual({ success: false, error: "点赞操作失败，请稍后重试" })
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it("propagates a safe permission failure from the database", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "community write access denied", code: "42501" } })
    expect(await setCommunityCommentLikeAction(replyId, postId, true)).toEqual({ success: false, error: "当前账号暂时不能发布或互动" })
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it.each([null, [], [{ liked: true, like_count: -1, like_version: 1 }], [{ liked: true, like_count: "2", like_version: 1 }],
    [{ like_count: 3, like_version: 1 }], [{ liked: true, like_count: 3 }], [{ liked: true, like_count: 3, like_version: -1 }],
    [{ liked: true, like_count: 3, like_version: Number.MAX_SAFE_INTEGER + 1 }]])(
    "does not invent a successful zero count from an invalid RPC response", async (data) => {
      mocks.rpc.mockResolvedValue({ data, error: null })
      expect((await setCommunityCommentLikeAction(replyId, postId, true)).success).toBe(false)
      expect(mocks.revalidate).not.toHaveBeenCalled()
    },
  )
})
