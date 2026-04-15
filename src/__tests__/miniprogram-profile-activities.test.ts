import { describe, expect, it } from "vitest"
import { filterMiniActivitiesByMember, normalizeMiniActivities } from "../../packages/miniprogram/src/pages/profile/profile-activities"

describe("mini profile activities helpers", () => {
  it("normalizes recent activities for display", () => {
    const result = normalizeMiniActivities([
      { id: "a1", title: "周末剧本局", location: "高田马场", activity_date: "2026-04-12" },
      { id: "a2", title: "", location: null, activity_date: "2026-04-01T10:00:00Z" },
    ])

    expect(result).toEqual([
      { id: "a1", title: "周末剧本局", location: "高田马场", activityDate: "2026-04-12" },
      { id: "a2", title: "未命名活动", location: "地点待补充", activityDate: "2026-04-01" },
    ])
  })

  it("filters rows by participant id before display", () => {
    const result = filterMiniActivitiesByMember([
      { id: "a1", title: "周末剧本局", location: "高田马场", activity_date: "2026-04-12", participant_ids: ["m1", "m2"] },
      { id: "a2", title: "别人的活动", location: "池袋", activity_date: "2026-04-10", participant_ids: ["m3"] },
    ], "m1")

    expect(result).toEqual([
      { id: "a1", title: "周末剧本局", location: "高田马场", activityDate: "2026-04-12" },
    ])
  })
})
