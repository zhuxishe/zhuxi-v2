import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ player: vi.fn(), context: vi.fn() }))
vi.mock("@/lib/auth/player", () => ({ requirePlayer: mocks.player }))
vi.mock("@/lib/activity-reviews/queries", () => ({ fetchActivityReviewContext: mocks.context }))
vi.mock("next-intl/server", () => ({ getLocale: async () => "zh" }))
vi.mock("@/components/player/activity-reviews/ActivityReviewPageContent", () => ({ ActivityReviewPageContent: () => null }))
import ActivityReviewsPage from "./page"

describe("activity review route query boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.player.mockResolvedValue({ memberId: "member" })
    mocks.context.mockImplementation(async (_roundId: string, search: string, page: number) => ({ search, page, total: 31, pageSize: 24, settings: { version: 1 } }))
  })

  it.each(["2147483648", "9007199254740991", "0", "-2", "1.5", "invalid"])("normalizes unsupported page %s before the RPC", async (page) => {
    await ActivityReviewsPage({ params: Promise.resolve({ roundId: "round" }), searchParams: Promise.resolve({ page }) })
    expect(mocks.context).toHaveBeenCalledExactlyOnceWith("round", "", 1)
  })

  it("falls back to the actual last page if a saved URL now points past the roster", async () => {
    await ActivityReviewsPage({ params: Promise.resolve({ roundId: "round" }), searchParams: Promise.resolve({ page: "999", search: "小竹" }) })
    expect(mocks.context.mock.calls).toEqual([["round", "小竹", 999], ["round", "小竹", 2]])
  })

  it("limits the UI search string and never loads private data before authentication", async () => {
    await ActivityReviewsPage({ params: Promise.resolve({ roundId: "round" }), searchParams: Promise.resolve({ search: "竹".repeat(120) }) })
    expect(mocks.context).toHaveBeenCalledExactlyOnceWith("round", "竹".repeat(80), 1)
    mocks.context.mockClear(); mocks.player.mockRejectedValue(new Error("unauthorized"))
    await expect(ActivityReviewsPage({ params: Promise.resolve({ roundId: "round" }), searchParams: Promise.resolve({}) })).rejects.toThrow("unauthorized")
    expect(mocks.context).not.toHaveBeenCalled()
  })
})
