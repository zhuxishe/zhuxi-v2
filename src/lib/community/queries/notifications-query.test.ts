import { createClient } from "@supabase/supabase-js"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ client: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.client }))
import { fetchCommunityNotifications } from "./notifications"

const now = "2026-09-29T01:00:00.000Z"
const receipt = {
  id: "receipt", notification_type: "registration_submitted", recipient_member_id: "member",
  actor_profile_id: null as string | null, post_id: null as string | null, comment_id: null as string | null, report_id: null, announcement_id: null,
  round_id: "closed-round", title_zh: "报名已提交", title_ja: "申込みを受け付けました",
  body_zh: "报名信息已保存", body_ja: "申込内容を保存しました", group_count: 1, read_at: null as string | null,
  created_at: now, expires_at: "2026-12-28T01:00:00.000Z",
}
let notifications: typeof receipt[]
let submissions: { round_id: string; member_id: string; cancelled_at?: string | null }[]
let requests: URL[]
let banned: boolean
let submissionsUnavailable: boolean

describe("notification delivery with the real Supabase request builder", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(now)
    notifications = [receipt]
    submissions = [{ round_id: receipt.round_id, member_id: "member" }]
    requests = []; banned = false; submissionsUnavailable = false
    mocks.client.mockReturnValue(createClient("https://notifications-test.invalid", "test-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (input, init) => {
        const url = new URL(String(input)); requests.push(url)
        const params = url.searchParams
        let data: unknown[] = []
        if (url.pathname.endsWith("/community_sanctions")) data = banned ? [{ id: "ban" }] : []
        if (url.pathname.endsWith("/community_notifications")) {
          const types = params.get("notification_type")?.slice(4, -1).split(",")
          data = notifications.filter((row) => (!params.get("recipient_member_id") || params.get("recipient_member_id") === `eq.${row.recipient_member_id}`)
            && (!types || types.includes(row.notification_type))
            && (!params.get("read_at") || row.read_at === null)
            && (!params.get("expires_at") || row.expires_at > params.get("expires_at")!.slice(3))
            && (!params.get("group_count") || row.group_count > Number(params.get("group_count")!.slice(3))))
          if (init?.method === "HEAD") return new Response(null, { headers: { "content-range": `0-${Math.max(0, data.length - 1)}/${data.length}` } })
          data = data.slice(0, Number(params.get("limit") ?? data.length))
        }
        if (url.pathname.endsWith("/match_round_submissions")) {
          if (submissionsUnavailable) return new Response(JSON.stringify({ message: "Unavailable", code: "42501" }), { status: 403 })
          const ids = params.get("round_id")?.slice(4, -1).split(",")
          data = submissions.filter((row) => (!params.get("member_id") || params.get("member_id") === `eq.${row.member_id}`)
            && (!ids || ids.includes(row.round_id)) && (!params.get("cancelled_at") || row.cancelled_at == null))
        }
        if (url.pathname.endsWith("/community_posts")) data = [{ id: "photo", post_type: "photo", status: "published" }]
        if (url.pathname.endsWith("/community_comments")) data = [{ id: "reply", status: "published" }]
        return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } })
      } },
    }))
  })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it("loads only this member's unexpired receipts and localizes the permanent record link", async () => {
    notifications.push({ ...receipt, id: "other", recipient_member_id: "other" }, { ...receipt, id: "expired", expires_at: now })
    const result = await fetchCommunityNotifications("member", "ja", { limit: 8 })
    expect(result.unreadCount).toBe(1)
    expect(result.items).toEqual([expect.objectContaining({
      id: "receipt", title: receipt.title_ja, body: receipt.body_ja,
      href: "/app/matches/rounds/closed-round", unavailable: false,
    })])
    expect(requests.find((url) => url.pathname.endsWith("/match_round_submissions"))?.searchParams.get("member_id")).toBe("eq.member")
  })

  it.each(["zh", "ja"] as const)("renders the comment-like count in %s without exposing actor metadata", async (locale) => {
    notifications = [{ ...receipt, id: "comment-like", notification_type: "comment_like",
      post_id: "photo", comment_id: "reply", actor_profile_id: "private-author", group_count: 3,
      title_zh: "must not display identity", title_ja: "must not display identity", body_zh: "private text", body_ja: "private text" }]
    const result = await fetchCommunityNotifications("member", locale, { limit: 8 })
    expect(result.items).toEqual([expect.objectContaining({
      id: "comment-like", title: locale === "ja" ? "3人があなたのコメントにいいねしました" : "有 3 人赞了你的评论",
      actor: null, body: "", groupCount: 3, href: "/app/community/photos/photo?comment=reply#comment-reply",
    })])
    expect(requests.some((url) => url.pathname.endsWith("/community_profiles"))).toBe(false)
    expect(result.unreadCount).toBe(1)
  })

  it("excludes zero-like tombstones from both notifications and the unread badge before pagination", async () => {
    notifications = [{ ...receipt, id: "cancelled-like", notification_type: "comment_like", group_count: 0 }, receipt]
    const result = await fetchCommunityNotifications("member", "zh", { limit: 1 })
    expect(result.items.map((item) => item.id)).toEqual(["receipt"])
    expect(result.unreadCount).toBe(1)
    const queries = requests.filter((url) => url.pathname.endsWith("/community_notifications"))
    expect(queries).toHaveLength(2)
    expect(queries.every((url) => url.searchParams.get("group_count") === "gt.0")).toBe(true)
  })

  it("updates an existing read comment-like notice's number without creating another unread item", async () => {
    notifications = [{ ...receipt, id: "comment-like", notification_type: "comment_like", group_count: 1, read_at: now }]
    const first = await fetchCommunityNotifications("member", "zh", { limit: 8 })
    notifications[0].group_count = 4
    const next = await fetchCommunityNotifications("member", "zh", { limit: 8 })
    expect(next.items).toHaveLength(1)
    expect(next.items[0]).toMatchObject({ id: first.items[0].id, readAt: now, createdAt: first.items[0].createdAt, title: "有 4 人赞了你的评论" })
    expect(next.unreadCount).toBe(0)
  })

  it("includes transactional receipts in both list and unread count after a community ban", async () => {
    banned = true
    notifications.push({ ...receipt, id: "matching", notification_type: "matching_submitted" }, { ...receipt, id: "like", notification_type: "like" })
    const result = await fetchCommunityNotifications("member", "zh", { limit: 8 })
    expect(result.items.map((item) => item.id)).toEqual(["receipt", "matching"])
    expect(result.unreadCount).toBe(2)
    expect(result.items.every((item) => item.href === "/app/matches/rounds/closed-round")).toBe(true)
  })

  it("marks a missing owned submission unavailable instead of linking another member's record", async () => {
    submissions = [{ round_id: receipt.round_id, member_id: "other" }]
    const result = await fetchCommunityNotifications("member", "zh", { limit: 8 })
    expect(result.items[0]).toMatchObject({ href: null, unavailable: true })
  })

  it("surfaces target lookup failures instead of treating an unverified receipt as available", async () => {
    submissionsUnavailable = true
    await expect(fetchCommunityNotifications("member", "zh", { limit: 8 })).rejects.toThrow("Failed to verify community notification targets")
  })

  it.each(["zh", "ja"] as const)("keeps a cancelled receipt available with its original title and current %s status", async (locale) => {
    submissions[0].cancelled_at = now
    const { items } = await fetchCommunityNotifications("member", locale, { limit: 8 })
    expect(items[0]).toMatchObject({ title: locale === "ja" ? receipt.title_ja : receipt.title_zh,
      href: "/app/matches/rounds/closed-round", unavailable: false })
    expect(items[0].body).toMatch(locale === "ja" ? /取り消|取消|キャンセル/ : /已取消/)
    const query = requests.find((url) => url.pathname.endsWith("/match_round_submissions"))!.searchParams
    expect(query.get("select")).toContain("cancelled_at")
    expect(query.has("cancelled_at")).toBe(false)
  })

  it.each([null, now])("restores the receipt after signup resumes without changing read state %s or timestamps", async (readAt) => {
    notifications = [{ ...receipt, read_at: readAt }]; submissions[0].cancelled_at = now
    const cancelled = await fetchCommunityNotifications("member", "zh", { limit: 8 })
    submissions[0].cancelled_at = null
    const restored = await fetchCommunityNotifications("member", "zh", { limit: 8 })
    expect(restored.items[0]).toMatchObject({ id: receipt.id, title: receipt.title_zh, body: receipt.body_zh,
      readAt, createdAt: receipt.created_at, href: "/app/matches/rounds/closed-round" })
    expect(cancelled.items[0]).toMatchObject({ id: receipt.id, readAt, createdAt: receipt.created_at })
    expect(restored.unreadCount).toBe(readAt ? 0 : 1)
    expect(cancelled.unreadCount).toBe(restored.unreadCount)
  })

  it("does not expose another member's cancellation status or detail link", async () => {
    submissions = [{ round_id: receipt.round_id, member_id: "other", cancelled_at: now }]
    const { items } = await fetchCommunityNotifications("member", "zh", { limit: 8 })
    expect(items[0]).toMatchObject({ body: receipt.body_zh, href: null, unavailable: true })
  })

  it("never rewrites matching questionnaire receipts as registration cancellations", async () => {
    notifications = [{ ...receipt, notification_type: "matching_submitted" }]; submissions[0].cancelled_at = now
    const { items } = await fetchCommunityNotifications("member", "zh", { limit: 8 })
    expect(items[0]).toMatchObject({ title: receipt.title_zh, body: receipt.body_zh, unavailable: false })
  })

  it("keeps the member's cancelled transactional receipt visible after a community ban", async () => {
    banned = true; submissions[0].cancelled_at = now
    const result = await fetchCommunityNotifications("member", "zh", { limit: 8 })
    expect(result.unreadCount).toBe(1)
    expect(result.items[0]).toMatchObject({ href: "/app/matches/rounds/closed-round", unavailable: false })
    expect(result.items[0].body).toContain("已取消")
  })
})
