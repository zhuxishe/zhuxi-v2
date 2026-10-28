// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from "react"
import { createRoot, type Root } from "react-dom/client"
import { NextIntlClientProvider } from "next-intl"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import zh from "@/messages/zh.json"
import ja from "@/messages/ja.json"
import { MatchTimeSummary } from "./MatchTimeSummary"
import { MatchDetailCard } from "./MatchDetailCard"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

let root: Root
const recommendedTime = "2026年11月1日周日 下午"
const recommendedSlot = "2026-11-01_下午"
const slots = [
  "2026-11-14_上午", "2026-11-03_下午", "2026-11-01_晚上",
  "2026-11-01_下午", "2026-11-07_晚上", "2026-11-01_上午",
  "2026-11-06_晚上", "2026-11-03_上午", "2026-11-01_下午",
]
const defaults: ComponentProps<typeof MatchTimeSummary> = {
  recommendedTime, recommendedSlot, sharedAvailability: { status: "ready", slots },
}
const dateRows = () => [...document.querySelectorAll<HTMLElement>("[data-shared-date]")]
const slotPills = () => [...document.querySelectorAll<HTMLElement>("[data-shared-slot]")]
const toggle = () => document.querySelector<HTMLButtonElement>("button[aria-expanded]")

async function render(props: Partial<ComponentProps<typeof MatchTimeSummary>> = {}, locale = "zh") {
  // NextIntl requires children in its props type even with React.createElement.
  // eslint-disable-next-line react/no-children-prop
  await act(async () => root.render(createElement(NextIntlClientProvider,
    { locale, timeZone: "Asia/Tokyo", messages: locale === "ja" ? ja : zh,
      children: createElement(MatchTimeSummary, { ...defaults, ...props }) },
  )))
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  document.body.innerHTML = '<div id="root"></div>'
  root = createRoot(document.getElementById("root")!)
})
afterEach(async () => {
  await act(async () => root.unmount())
  vi.restoreAllMocks()
})

describe("player shared time summary", () => {
  it("groups chronological dates, preserves every available period and deduplicates repeated slots", async () => {
    await render()
    expect(dateRows().map((row) => row.dataset.sharedDate)).toEqual(["2026-11-01", "2026-11-03", "2026-11-06"])
    expect([...dateRows()[0].querySelectorAll<HTMLElement>("[data-shared-slot]")].map((pill) => pill.dataset.sharedSlot)).toEqual([
      "2026-11-01_上午", "2026-11-01_下午", "2026-11-01_晚上",
    ])
    expect(slotPills()).toHaveLength(6)
    expect(document.body.textContent).toContain("共 8 个时段")
    expect(document.body.textContent).toContain("日本时间")
    expect(document.body.textContent).toContain("2026年11月1日周日")
    expect(slots[0]).toBe("2026-11-14_上午")
  })

  it("shows three dates first and expands or collapses the complete date list without changing the recommendation", async () => {
    await render()
    const control = toggle()!
    expect(control.textContent).toContain("查看全部 5 个日期")
    expect(control.getAttribute("aria-expanded")).toBe("false")
    const listId = control.getAttribute("aria-controls")!
    expect(document.getElementById(listId)).not.toBeNull()
    await act(async () => control.click())
    expect(dateRows().map((row) => row.dataset.sharedDate)).toEqual(["2026-11-01", "2026-11-03", "2026-11-06", "2026-11-07", "2026-11-14"])
    expect(slotPills()).toHaveLength(8)
    expect(toggle()!.getAttribute("aria-expanded")).toBe("true")
    expect(toggle()!.textContent).toContain("收起")
    expect(document.body.textContent).toContain(recommendedTime)
    await act(async () => toggle()!.click())
    expect(dateRows()).toHaveLength(3)
    expect(document.body.textContent).toContain(recommendedTime)
  })

  it("prioritizes the next three dates while preserving older dates behind the expand control", async () => {
    await render({ today: "2026-11-04", sharedAvailability: { status: "ready", slots: [...slots, "2026-11-10_晚上"] } })
    expect(dateRows().map((row) => row.dataset.sharedDate)).toEqual(["2026-11-06", "2026-11-07", "2026-11-10"])
    expect(document.body.textContent).toContain(recommendedTime)
    await act(async () => toggle()!.click())
    expect(dateRows().map((row) => row.dataset.sharedDate)).toEqual([
      "2026-11-06", "2026-11-07", "2026-11-10", "2026-11-14", "2026-11-01", "2026-11-03",
    ])
    expect(document.body.textContent).toContain("已过日期")
    expect(slotPills()).toHaveLength(9)
    await act(async () => toggle()!.click())
    expect(dateRows().map((row) => row.dataset.sharedDate)).toEqual(["2026-11-06", "2026-11-07", "2026-11-10"])
  })

  it("retains all historical availability when every selected date has already passed", async () => {
    await render({ today: "2026-12-01" })
    expect(dateRows().map((row) => row.dataset.sharedDate)).toEqual(["2026-11-01", "2026-11-03", "2026-11-06"])
    expect(document.body.textContent).toContain("已过日期")
    expect(document.body.textContent).toContain(recommendedTime)
    await act(async () => toggle()!.click())
    expect(dateRows().map((row) => row.dataset.sharedDate)).toEqual(["2026-11-01", "2026-11-03", "2026-11-06", "2026-11-07", "2026-11-14"])
    expect(slotPills()).toHaveLength(8)
  })

  it("treats the supplied Japanese calendar date itself as upcoming", async () => {
    await render({ today: "2026-11-03" })
    expect(dateRows().map((row) => row.dataset.sharedDate)).toEqual(["2026-11-03", "2026-11-06", "2026-11-07"])
  })

  it("does not add a redundant expand button when all dates already fit", async () => {
    await render({ sharedAvailability: { status: "ready", slots: ["2026-11-01_下午", "2026-11-01_晚上", "2026-11-03_上午"] } })
    expect(dateRows()).toHaveLength(2)
    expect(toggle()).toBeNull()
  })

  it("highlights exactly the saved recommendation when it is in the common slots, including legacy space format", async () => {
    await render({ recommendedSlot: "2026-11-01 下午" })
    const recommended = document.querySelectorAll<HTMLElement>("[data-recommended-slot]")
    expect(recommended).toHaveLength(1)
    expect(recommended[0].dataset.recommendedSlot).toBe(recommendedSlot)
    expect(recommended[0].textContent).toContain("下午")
    expect(recommended[0].textContent).toContain("推荐")
    expect(document.body.textContent).not.toContain(zh.playerMatches.sharedTimeRecommendationChanged)
  })

  it("keeps a saved recommendation separate when newer answers no longer overlap at that time", async () => {
    await render({ sharedAvailability: { status: "ready", slots: ["2026-11-03_上午", "2026-11-03_晚上"] } })
    expect(document.body.textContent).toContain(recommendedTime)
    expect(slotPills().map((pill) => pill.dataset.sharedSlot)).toEqual(["2026-11-03_上午", "2026-11-03_晚上"])
    expect(document.querySelector("[data-recommended-slot]")).toBeNull()
    expect(document.body.textContent).toContain(zh.playerMatches.sharedTimeRecommendationChanged)
  })

  it.each([null, undefined, { status: "unavailable" as const, slots: [] }])("shows unavailable rather than falsely claiming no overlap for %j", async (sharedAvailability) => {
    await render({ sharedAvailability })
    expect(document.body.textContent).toContain(zh.playerMatches.sharedTimesUnavailable)
    expect(document.body.textContent).not.toContain(zh.playerMatches.sharedTimesEmpty)
    expect(document.body.textContent).toContain(recommendedTime)
    expect(dateRows()).toHaveLength(0)
    expect(toggle()).toBeNull()
  })

  it("distinguishes a valid empty intersection and never inserts the saved recommendation into it", async () => {
    await render({ sharedAvailability: { status: "ready", slots: [] } })
    expect(document.body.textContent).toContain(zh.playerMatches.sharedTimesEmpty)
    expect(document.body.textContent).not.toContain(zh.playerMatches.sharedTimesUnavailable)
    expect(document.body.textContent).toContain(recommendedTime)
    expect(slotPills()).toHaveLength(0)
    expect(toggle()).toBeNull()
  })

  it("renders Japanese date, weekday and period labels with a Japanese time-zone hint", async () => {
    await render({ recommendedTime: "2026年11月1日(日) 午後" }, "ja")
    expect(document.body.textContent).toContain("お二人に共通する日時")
    expect(document.body.textContent).toContain("日本時間")
    expect(document.body.textContent).toContain("2026年11月1日(日)")
    expect(dateRows()[0].textContent).toContain("午前")
    expect(dateRows()[0].textContent).toContain("午後")
    expect(dateRows()[0].textContent).toContain("夜")
    expect(document.body.textContent).toContain("全 8 枠")
    expect(toggle()!.textContent).toContain("全 5 日の日程を見る")
    expect(document.body.textContent).not.toContain("上午")
    expect(document.body.textContent).not.toContain("_下午")
  })

  it("presents the availability as read-only and does not offer a misleading booking or selection control", async () => {
    await render()
    expect(document.querySelector("input, textarea, select, form")).toBeNull()
    expect(slotPills().every((pill) => pill.tagName === "SPAN" && !pill.hasAttribute("role"))).toBe(true)
    expect([...document.querySelectorAll("button")]).toEqual([toggle()])
    expect(document.body.textContent).toContain(zh.playerMatches.sharedTimesHint)
  })

  it.each([{ isGroup: true }, { ended: true }])("keeps the shared duo schedule off non-active-duo cards: %j", async (overrides) => {
    const labels = zh.playerMatches
    // NextIntl requires children in its props type even with React.createElement.
    // eslint-disable-next-line react/no-children-prop
    await act(async () => root.render(createElement(NextIntlClientProvider,
      { locale: "zh", timeZone: "Asia/Tokyo", messages: zh,
        children: createElement(MatchDetailCard, {
        partner: { name: "示例搭档", hobbyTags: [], gameTypePref: null, scenarioThemeTags: [], expressionStyleTags: [], groupRoleTags: [] },
        sessionName: "示例轮次", reviewed: false, matchId: "fixture-match", labels,
          ...defaults, ...overrides,
        }) },
    )))
    expect(document.querySelector('[aria-label="活动时间"]')).toBeNull()
    expect(dateRows()).toHaveLength(0)
    expect(document.body.textContent).not.toContain(zh.playerMatches.sharedTimesTitle)
    expect(document.body.textContent).toContain(recommendedTime)
  })
})
