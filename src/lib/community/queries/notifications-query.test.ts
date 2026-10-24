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
  match_result_id: null as string | null, match_session_id: null as string | null, publication_version: null as number | null,
  body_zh: "报名信息已保存", body_ja: "申込内容を保存しました", group_count: 1, read_at: null as string | null,
  created_at: now, expires_at: "2026-12-28T01:00:00.000Z",
}
let notifications: typeof receipt[]
let submissions: { round_id: string; member_id: string; cancelled_at?: string | null; deleted_at?: string | null }[]
let requests: URL[]
let banned: boolean
let submissionsUnavailable: boolean
let matchingSessions: { id: string; status: string; publication_version: number }[]
let matchingRounds: { id: string; round_name: string; title_ja: string | null }[]
let matchingResults: { id: string; session_id: string; status: string; publication_version: number; member_a_id: string; member_b_id: string; group_members: string[] | null }[]

describe("notification delivery with the real Supabase request builder", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(now)
    notifications = [receipt]
    submissions = [{ round_id: receipt.round_id, member_id: "member" }]
    requests = []; banned = false; submissionsUnavailable = false
    matchingSessions = [{ id: "session", status: "confirmed", publication_version: 2 }]
    matchingRounds = [{ id: "closed-round", round_name: "秋季活动", title_ja: "秋のイベント" }]
    matchingResults = [{ id: "result", session_id: "session", status: "confirmed", publication_version: 2, member_a_id: "member", member_b_id: "partner", group_members: null }]
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
            && (params.get("round.deleted_at") !== "is.null" || !row.deleted_at)
            && (!ids || ids.includes(row.round_id)) && (!params.get("cancelled_at") || row.cancelled_at == null))
        }
        if (url.pathname.endsWith("/community_posts")) data = [{ id: "photo", post_type: "photo", status: "published" }]
        if (url.pathname.endsWith("/community_comments")) data = [{ id: "reply", status: "published" }]
        if (url.pathname.endsWith("/match_sessions")) data = matchingSessions
        if (url.pathname.endsWith("/match_results")) data = matchingResults
        if (url.pathname.endsWith("/match_rounds")) data = matchingRounds
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

  it("keeps a deleted activity receipt's text and read state while making its target unavailable", async () => {
    notifications = [{ ...receipt, read_at: now }]
    submissions[0].deleted_at = now
    const result = await fetchCommunityNotifications("member", "zh", { limit: 8 })
    expect(result.items[0]).toMatchObject({ title: receipt.title_zh, body: receipt.body_zh, readAt: now, createdAt: receipt.created_at, href: null, unavailable: true })
    expect(result.unreadCount).toBe(0)
    const query = requests.find((url) => url.pathname.endsWith("/match_round_submissions"))!.searchParams
    expect(query.get("round.deleted_at")).toBe("is.null")
    expect(query.get("select")).toContain("match_rounds!inner")
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
    expect(items[0]).toMatchObject({ title: "匹配问卷已提交", body: "「秋季活动」的匹配问卷已保存，可在参与记录中查看。", unavailable: false })
  })

  it("keeps the member's cancelled transactional receipt visible after a community ban", async () => {
    banned = true; submissions[0].cancelled_at = now
    const result = await fetchCommunityNotifications("member", "zh", { limit: 8 })
    expect(result.unreadCount).toBe(1)
    expect(result.items[0]).toMatchObject({ href: "/app/matches/rounds/closed-round", unavailable: false })
    expect(result.items[0].body).toContain("已取消")
  })

  it("delivers a published matching notice through the existing bell even after a community ban", async () => {
    banned = true
    notifications = [{ ...receipt, notification_type: "matching_published", match_session_id: "session", match_result_id: "result", publication_version: 2 }]
    const result = await fetchCommunityNotifications("member", "zh", { limit: 8 })
    expect(result.items[0]).toMatchObject({ href: "/app/matches/result", unavailable: false, readAt: null })
    expect(result.unreadCount).toBe(1)
    expect(requests.find((url) => url.pathname.endsWith("/match_results"))?.searchParams.get("select")).toContain("publication_version")
  })

  it("retains an obsolete publication notice's identity and read state while hiding its former detail and body", async () => {
    notifications = [{ ...receipt, notification_type: "matching_published", match_session_id: "session", match_result_id: "result", publication_version: 1, read_at: now, body_zh: "old partner information" }]
    const result = await fetchCommunityNotifications("member", "zh", { limit: 8 })
    expect(result.items[0]).toMatchObject({ id: receipt.id, readAt: now, createdAt: now, href: "/app/matches#matching", unavailable: true })
    expect(result.items[0].body).toContain("撤回或更新")
    expect(result.items[0].body).not.toContain("old partner")
    expect(result.items[0].body).not.toContain("发布版本")
    expect(result.items[0].unavailableHint).not.toContain("发布版本")
    expect(result.unreadCount).toBe(0)
  })

  it("withdrawal notices remain useful without a submission or any visible draft", async () => {
    submissions = []
    matchingSessions[0].status = "draft"
    notifications = [{ ...receipt, notification_type: "matching_withdrawn", match_session_id: "session", publication_version: 2 }]
    const result = await fetchCommunityNotifications("member", "ja", { limit: 8 })
    expect(result.items[0]).toMatchObject({ href: "/app/matches#matching", unavailable: false })
    expect(requests.some((url) => url.pathname.endsWith("/match_results"))).toBe(false)
  })

  it.each(["zh", "ja"] as const)("shows current player copy for existing matching notices in %s without rewriting their state", async (locale) => {
    matchingResults.push({ ...matchingResults[0], id: "cancelled-result", status: "cancelled" })
    notifications = ["matching_submitted", "matching_published", "matching_unmatched", "matching_withdrawn", "matching_cancelled"].map((type, index) => ({
      ...receipt, id: `matching-${index}`, notification_type: type, match_session_id: "session",
      match_result_id: type === "matching_published" ? "result" : type === "matching_cancelled" ? "cancelled-result" : null,
      publication_version: 2, read_at: now,
      title_zh: "本批 · 内部方案", title_ja: "内部バージョン", body_zh: "请等待重新发布 · 内部方案", body_ja: "再公開をお待ちください · 内部バージョン",
    }))
    const saved = structuredClone(notifications)
    const { items, unreadCount } = await fetchCommunityNotifications("member", locale, { limit: 8 })
    expect(unreadCount).toBe(0)
    expect(items).toHaveLength(5)
    for (const item of items) {
      expect(item.body).toContain(locale === "ja" ? "秋のイベント" : "秋季活动")
      expect(item.title + item.body).not.toMatch(/本批|内部|发布版本|重新发布|再公開/)
      expect(item).toMatchObject({ readAt: now, createdAt: now })
    }
    expect(items[0].href).toBe("/app/matches/rounds/closed-round")
    expect(items[1].href).toBe("/app/matches/result")
    expect(items[2].href).toBe("/app/matches#matching")
    expect(items[3].href).toBe("/app/matches#matching")
    expect(notifications).toEqual(saved)
    const query = requests.find((url) => url.pathname.endsWith("/match_rounds"))!.searchParams
    expect(query.get("id")).toBe("in.(closed-round)")
    expect(query.get("select")).toBe("id,round_name,title_ja:content_config->>titleJa")
  })

  it("keeps a withdrawn notice useful when its round has been removed without exposing stored internal copy", async () => {
    matchingRounds = []
    notifications = [{ ...receipt, notification_type: "matching_withdrawn", title_zh: "本批匹配", body_zh: "内部方案，请等待重新发布" }]
    const { items } = await fetchCommunityNotifications("member", "zh", { limit: 8 })
    expect(items[0]).toMatchObject({ title: "匹配安排已撤回", body: "匹配安排已撤回，后续消息请留意站内通知。", href: "/app/matches#matching", unavailable: false })
  })

})
