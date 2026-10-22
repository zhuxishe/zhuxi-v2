import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { calendarDateRange } from "@/lib/calendar-date"

vi.mock("next-intl", () => ({
  useTranslations: () => Object.assign((key: string) => key, { rich: () => null }),
}))

import { TimeGridSelector } from "./TimeGridSelector"
import { RoundStatsPanel } from "@/components/admin/RoundStatsPanel"

describe("activity date grid rendering", () => {
  it.each([
    ["2026-10-21", "2026-11-03"],
    ["2026-03-01", "2026-03-14"],
  ])("renders all fourteen player dates and preserves saved selections from %s to %s", (startDate, endDate) => {
    const value = { [endDate]: ["上午", "晚上"] }
    const before = structuredClone(value)
    const html = renderToStaticMarkup(createElement(TimeGridSelector, { startDate, endDate, value, onChange: vi.fn() }))
    const dates = [...html.matchAll(/aria-label="(\d{2}-\d{2}) morning"/g)].map((match) => match[1])
    expect(dates).toEqual(calendarDateRange(startDate, endDate).map((date) => date.slice(5)))
    expect(dates).toHaveLength(14)
    expect(html).toContain(`aria-label="${endDate.slice(5)} morning" aria-pressed="true"`)
    expect(html).toContain(`aria-label="${endDate.slice(5)} evening" aria-pressed="true"`)
    expect(html).toContain(`aria-label="${endDate.slice(5)} afternoon" aria-pressed="false"`)
    expect(value).toEqual(before)
  })

  it("renders the actual calendar weekday and original weekend styling", () => {
    const html = renderToStaticMarkup(createElement(TimeGridSelector, {
      startDate: "2026-10-24", endDate: "2026-10-26", value: {}, onChange: vi.fn(),
    }))
    expect(html).toContain("(weekdays.sat)")
    expect(html).toContain("(weekdays.sun)")
    expect(html).toContain("(weekdays.mon)")
    expect(html.match(/bg-sakura-muted/g)).toHaveLength(2)
  })

  it("keeps the final date and its counts visible in the admin heatmap", () => {
    const html = renderToStaticMarkup(createElement(RoundStatsPanel, {
      activityStart: "2026-10-21", activityEnd: "2026-11-03",
      stats: { total: 3, gameTypeDist: { duo: 1, multi: 1, either: 1 }, slotCounts: { "2026-11-03_上午": 3 } },
    }))
    const labels = [...html.matchAll(/>(\d{2}-\d{2}) \(([日月火水木金土])\)<\/td>/g)].map((match) => [match[1], match[2]])
    expect(labels).toHaveLength(14)
    expect(labels[0]).toEqual(["10-21", "水"])
    expect(labels.at(-1)).toEqual(["11-03", "火"])
    expect(html).toContain(">3</div>")
  })
})
