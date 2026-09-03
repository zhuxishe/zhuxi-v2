import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))

import {
  archivePastEventReview,
  createPastEventReview,
  permanentlyDeletePastEventReview,
  preparePastEventReviewMediaUpload,
  removePastEventReviewGalleryImage,
  restorePastEventReview,
  updatePastEventReview,
} from "./actions"

const reviewId = "11111111-1111-4111-8111-111111111111"
const initialUpdatedAt = "2026-09-03T00:00:00.000Z"
const nextUpdatedAt = "2026-09-03T00:01:00.000Z"

const validReview = {
  title: "测试活动",
  summary: "活动总结",
  cover_url: "/images/test.webp",
  gallery_urls: [],
  status: "published" as const,
  is_published: true,
  is_player_visible: false,
  registration_status: "open" as const,
}

describe("past event review V2 actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      role: "admin",
    })
  })

  it("rejects a short audit reason before opening a DB client", async () => {
    const result = await createPastEventReview(validReview, "短")

    expect(result.success).not.toBe(true)
    expect(result.error).toContain("4")
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it("refuses to sign activity media before the Contract outbox exists", async () => {
    const cleanupTable = {
      select: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "PGRST205", message: "content_media_cleanup_jobs not found" },
        }),
      }),
    }
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue(cleanupTable),
    })

    const result = await preparePastEventReviewMediaUpload(
      reviewId,
      "cover",
      { size: 1024, type: "image/png" },
      "上传大型活动封面并记录来源",
      initialUpdatedAt,
    )

    expect(result).toEqual({
      error: "数据库尚未完成内容管理 V2 Contract，暂时不能上传活动图片",
    })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it("creates with independent visibility and registration fields while allowing HTTPS fallback media", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: reviewId }, error: null })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })
    mocks.createClient.mockResolvedValue({ from: vi.fn().mockReturnValue({ insert }) })
    const reason = "录入九月大型活动资料"

    const result = await createPastEventReview({
      ...validReview,
      cover_url: "https://cdn.example.net/activity/cover.jpg",
      registration_deadline: "2026-09-20T12:00:00+09:00",
      registration_label: "外部报名",
    }, reason)

    expect(result).toEqual({ success: true, reviewId })
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      cover_url: "https://cdn.example.net/activity/cover.jpg",
      is_published: true,
      is_player_visible: false,
      registration_status: "open",
      registration_deadline: "2026-09-20T12:00:00+09:00",
      registration_label: "外部报名",
      audit_reason: reason,
    }))
  })

  it.each([
    [
      "managed public URL pasted into a new record",
      "https://api.zhuxishe.com/storage/v1/object/public/activity-media/activities/11111111-1111-4111-8111-111111111111/cover.webp",
    ],
    [
      "relative Storage route",
      "/storage/v1/object/public/activity-media/activities/11111111-1111-4111-8111-111111111111/cover.webp",
    ],
    [
      "private script signed URL",
      "https://api.zhuxishe.com/storage/v1/object/sign/scripts/pages/11111111-1111-4111-8111-111111111111/page.webp?token=secret",
    ],
  ])("rejects %s before opening a DB client", async (_, coverUrl) => {
    const result = await createPastEventReview({
      ...validReview,
      cover_url: coverUrl,
    }, "录入大型活动并检查媒体来源")

    expect(result.success).not.toBe(true)
    expect(result.error).toBeTruthy()
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it("does not allow an ordinary admin to restore an archived review", async () => {
    const result = await restorePastEventReview(reviewId, "恢复误归档活动记录", initialUpdatedAt)

    expect(result).toEqual({ error: "仅超级管理员可以恢复大型活动" })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it("does not allow an ordinary admin to permanently delete a review", async () => {
    const result = await permanentlyDeletePastEventReview(reviewId, "确认该归档记录属于重复数据", initialUpdatedAt)

    expect(result).toEqual({ error: "仅超级管理员可以永久删除大型活动" })
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it("allows only an archived target through the authenticated hard-delete RPC", async () => {
    mocks.requireAdmin.mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      role: "super_admin",
    })
    const reviewChain = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          cover_url: "https://cdn.example.net/cover.jpg",
          gallery_urls: ["https://cdn.example.net/gallery.jpg"],
          archived_at: "2026-09-03T00:00:00Z",
          updated_at: initialUpdatedAt,
        },
        error: null,
      }),
    }
    reviewChain.select.mockReturnValue(reviewChain)
    reviewChain.eq.mockReturnValue(reviewChain)
    const cleanupJobsChain = {
      eq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    cleanupJobsChain.eq.mockReturnValue(cleanupJobsChain)
    cleanupJobsChain.order.mockReturnValue(cleanupJobsChain)
    const cleanupTable = {
      select: vi.fn().mockImplementation((columns: string) => (
        columns === "id"
          ? { limit: vi.fn().mockResolvedValue({ data: [], error: null }) }
          : cleanupJobsChain
      )),
    }
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => (
        table === "content_media_cleanup_jobs" ? cleanupTable : reviewChain
      )),
    })
    const rpc = vi.fn().mockResolvedValue({ error: null })
    mocks.createClient.mockResolvedValue({ rpc })
    const reason = "确认归档记录为重复活动资料"

    const result = await permanentlyDeletePastEventReview(reviewId, reason, initialUpdatedAt)

    expect(result).toEqual({ success: true })
    expect(rpc).toHaveBeenCalledWith("admin_hard_delete_past_event_review_v2", {
      p_review_id: reviewId,
      p_reason: reason,
      p_expected_updated_at: initialUpdatedAt,
    })
  })

  it("restores through the administrator session rather than a service-role client", async () => {
    mocks.requireAdmin.mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      role: "super_admin",
    })
    const chain = {
      update: vi.fn(),
      eq: vi.fn(),
      not: vi.fn(),
      select: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: reviewId, updated_at: nextUpdatedAt }, error: null }),
    }
    chain.update.mockReturnValue(chain)
    chain.eq.mockReturnValue(chain)
    chain.not.mockReturnValue(chain)
    chain.select.mockReturnValue(chain)
    const from = vi.fn().mockReturnValue(chain)
    mocks.createClient.mockResolvedValue({ from })
    const reason = "核实后恢复被误归档的大型活动"

    const result = await restorePastEventReview(reviewId, reason, initialUpdatedAt)

    expect(result).toEqual({ success: true, updatedAt: nextUpdatedAt })
    expect(chain.update).toHaveBeenCalledWith({
      archived_at: null,
      archived_by: null,
      archive_reason: null,
      audit_reason: reason,
    })
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it("archives with both archive and audit reasons through the authenticated client", async () => {
    const chain = {
      update: vi.fn(),
      eq: vi.fn(),
      is: vi.fn(),
      select: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: reviewId, updated_at: nextUpdatedAt }, error: null }),
    }
    chain.update.mockReturnValue(chain)
    chain.eq.mockReturnValue(chain)
    chain.is.mockReturnValue(chain)
    chain.select.mockReturnValue(chain)
    const from = vi.fn().mockReturnValue(chain)
    mocks.createClient.mockResolvedValue({ from })

    const reason = "活动已结束，按内容管理规范归档"
    const result = await archivePastEventReview(reviewId, reason, initialUpdatedAt)

    expect(result).toEqual({ success: true, updatedAt: nextUpdatedAt })
    expect(from).toHaveBeenCalledWith("past_event_reviews")
    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({
      archived_by: "22222222-2222-4222-8222-222222222222",
      archive_reason: reason,
      audit_reason: reason,
    }))
    expect(chain.eq).toHaveBeenCalledWith("id", reviewId)
    expect(chain.eq).toHaveBeenCalledWith("updated_at", initialUpdatedAt)
    expect(chain.is).toHaveBeenCalledWith("archived_at", null)
  })

  it("rejects an edit carrying a stale UI revision before writing", async () => {
    const chain = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          cover_url: "/images/test.webp",
          gallery_urls: [],
          archived_at: null,
          updated_at: nextUpdatedAt,
        },
        error: null,
      }),
      update: vi.fn(),
    }
    chain.select.mockReturnValue(chain)
    chain.eq.mockReturnValue(chain)
    mocks.createClient.mockResolvedValue({ from: vi.fn().mockReturnValue(chain) })

    const result = await updatePastEventReview(
      reviewId,
      { is_published: false },
      "根据运营安排隐藏官网活动",
      initialUpdatedAt,
    )

    expect(result).toEqual({ error: "大型活动已在其他页面更新，请刷新后重试" })
    expect(chain.update).not.toHaveBeenCalled()
  })

  it("uses the UI revision as the write CAS and returns the new revision", async () => {
    const chain = {
      select: vi.fn(),
      eq: vi.fn(),
      is: vi.fn(),
      maybeSingle: vi.fn()
        .mockResolvedValueOnce({
          data: {
            cover_url: "/images/test.webp",
            gallery_urls: [],
            archived_at: null,
            updated_at: initialUpdatedAt,
          },
          error: null,
        })
        .mockResolvedValueOnce({ data: { id: reviewId, updated_at: nextUpdatedAt }, error: null }),
      update: vi.fn(),
    }
    chain.select.mockReturnValue(chain)
    chain.eq.mockReturnValue(chain)
    chain.is.mockReturnValue(chain)
    chain.update.mockReturnValue(chain)
    mocks.createClient.mockResolvedValue({ from: vi.fn().mockReturnValue(chain) })

    const result = await updatePastEventReview(
      reviewId,
      { is_published: false },
      "根据运营安排隐藏官网活动",
      initialUpdatedAt,
    )

    expect(result).toEqual({ success: true, updatedAt: nextUpdatedAt })
    expect(chain.eq).toHaveBeenCalledWith("updated_at", initialUpdatedAt)
  })

  it("does not remove a gallery image when the media UI revision is stale", async () => {
    const galleryUrl = "https://cdn.example.net/activity/gallery.jpg"
    const chain = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          gallery_urls: [galleryUrl],
          archived_at: null,
          updated_at: nextUpdatedAt,
        },
        error: null,
      }),
      update: vi.fn(),
    }
    chain.select.mockReturnValue(chain)
    chain.eq.mockReturnValue(chain)
    mocks.createClient.mockResolvedValue({ from: vi.fn().mockReturnValue(chain) })

    const result = await removePastEventReviewGalleryImage(
      reviewId,
      galleryUrl,
      "删除重复上传的活动图片",
      initialUpdatedAt,
    )

    expect(result).toEqual({ error: "大型活动已在其他页面更新，请刷新后重试" })
    expect(chain.update).not.toHaveBeenCalled()
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })
})
