import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
}))
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))

import { loadActivityRegistrationLinkOptions, saveActivityRegistrationLink } from "./actions"

const activity = "10000000-0000-4000-8000-000000000001"
const otherActivity = "10000000-0000-4000-8000-000000000002"
const round = "20000000-0000-4000-8000-000000000001"
const otherRound = "20000000-0000-4000-8000-000000000002"

const roundDefaults = {
  round_name: "正式报名",
  purpose: "registration",
  is_test: false,
  deleted_at: null,
  status: "open",
  survey_start: "2026-11-24T00:00:00Z",
  survey_end: "2026-12-01T00:00:00Z",
}

function listFixtures(activities: object[], rounds: object[]) {
  mocks.from.mockImplementation((relation: string) => {
    const query = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: relation === "match_rounds" ? rounds : activities, error: null }),
    }
    return query
  })
}

beforeEach(() => vi.resetAllMocks())

describe("activity registration links", () => {
  it("loads only eligible rounds and marks the other side's existing link", async () => {
    listFixtures([
      { id: activity, title: "海报", status: "draft", archived_at: null, registration_round_id: round },
      { id: otherActivity, title: "其他海报", status: "published", archived_at: null, registration_round_id: otherRound },
    ], [
      { ...roundDefaults, id: round },
      { ...roundDefaults, id: otherRound, round_name: "其他报名", purpose: "matching", status: "closed" },
      { ...roundDefaults, id: "draft", status: "draft" },
      { ...roundDefaults, id: "test", is_test: true },
      { ...roundDefaults, id: "notice", purpose: "announcement" },
      { ...roundDefaults, id: "deleted", deleted_at: "2026-11-25T00:00:00Z" },
    ])
    const result = await loadActivityRegistrationLinkOptions({ largeActivityId: activity })
    expect(result.current).toEqual({ id: round, title: "正式报名", archived: false })
    expect(result.options).toMatchObject([{ id: round }, { id: otherRound, linkedTo: "其他海报" }])
    expect(result.options?.[0].linkedTo).toBeUndefined()
    expect(mocks.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(mocks.from.mock.invocationCallOrder[0])
  })

  it("identifies an archived activity on the round side and excludes it from choices", async () => {
    listFixtures([
      { id: activity, title: "旧海报", status: "published", archived_at: "2026-11-25T00:00:00Z", registration_round_id: round },
      { id: otherActivity, title: "草稿海报", status: "draft", archived_at: null, registration_round_id: null },
    ], [{ ...roundDefaults, id: round }])
    const result = await loadActivityRegistrationLinkOptions({ roundId: round })
    expect(result.current).toEqual({ id: activity, title: "旧海报（已归档）", archived: true })
    expect(result.options).toMatchObject([{ id: otherActivity, detail: "草稿" }])
  })

  it("uses a single transactional operation and refreshes both sides when the round rebinds", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ activity_ids: [activity, otherActivity], round_ids: [round] }], error: null })
    const result = await saveActivityRegistrationLink({ target: { roundId: round }, counterpartId: otherActivity, expectedCounterpartId: activity })
    expect(result).toEqual({ success: true })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("admin_set_large_activity_registration_link", {
      p_activity_id: null, p_round_id: round, p_counterpart_id: otherActivity, p_expected_counterpart_id: activity,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/admin/matching/rounds/${round}`)
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/app/scripts/large/${activity}`)
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/app/scripts/large/${otherActivity}`)
  })

  it("reports a concurrently occupied round without refreshing or writing a second action", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate key" } })
    const result = await saveActivityRegistrationLink({ target: { largeActivityId: activity }, counterpartId: round, expectedCounterpartId: null })
    expect(result.error).toBe("对方已关联其他活动，请先解除原关联")
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
