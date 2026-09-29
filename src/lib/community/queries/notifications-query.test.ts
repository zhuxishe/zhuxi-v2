import { createClient } from "@supabase/supabase-js"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ client: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.client }))
import { fetchCommunityNotifications } from "./notifications"

const now = "2026-09-29T01:00:00.000Z"
const receipt = {
  id: "receipt", notification_type: "registration_submitted", recipient_member_id: "member",
  actor_profile_id: null, post_id: null, comment_id: null, report_id: null, announcement_id: null,
  round_id: "closed-round", title_zh: "报名已提交", title_ja: "申込みを受け付けました",
  body_zh: "报名信息已保存", body_ja: "申込内容を保存しました", group_count: 1, read_at: null as string | null,
  created_at: now, expires_at: "2026-12-28T01:00:00.000Z",
}
let notifications: typeof receipt[]
let submissions: { round_id: string; member_id: string }[]
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
            && (!params.get("expires_at") || row.expires_at > params.get("expires_at")!.slice(3)))
          if (init?.method === "HEAD") return new Response(null, { headers: { "content-range": `0-${Math.max(0, data.length - 1)}/${data.length}` } })
          data = data.slice(0, Number(params.get("limit") ?? data.length))
        }
        if (url.pathname.endsWith("/match_round_submissions")) {
          if (submissionsUnavailable) return new Response(JSON.stringify({ message: "Unavailable", code: "42501" }), { status: 403 })
          const ids = params.get("round_id")?.slice(4, -1).split(",")
          data = submissions.filter((row) => (!params.get("member_id") || params.get("member_id") === `eq.${row.member_id}`)
            && (!ids || ids.includes(row.round_id)))
        }
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
})
