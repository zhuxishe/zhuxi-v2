import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { MatchingBoardDetails } from "./MatchingBoardDetails"
import type { EnrichedMatchResult, EnrichedMember, SubmissionPrefInfo } from "./match-detail-types"

function member(id: string, gender = "male"): EnrichedMember {
  return {
    id, record_source: null,
    member_identity: { full_name: id, nickname: null, gender, school_name: "示例大学", hobby_tags: ["阅读"], nationality: "中国", degree_level: null, department: null },
    member_interests: { game_type_pref: "档案游戏", scenario_theme_tags: ["档案题材"], preferred_time_slots: ["周六晚"], social_goal_primary: "认识朋友" },
    member_personality: { expression_style_tags: ["倾听"], group_role_tags: ["支持者"], extroversion: 3, warmup_speed: "慢热" },
    member_boundaries: { preferred_gender_mix: "档案性别偏好" },
  }
}
const members = [member("张三"), member("李四", "female")]
const submissionPrefs: Record<string, SubmissionPrefInfo> = {
  张三: { gender_pref: "女", game_type_pref: "本轮双人本", availability: { "2026-11-02": ["下午", "晚上"] }, interest_tags: ["本轮题材"], social_style: "本轮社交风格" },
  李四: { gender_pref: "男", game_type_pref: "本轮双人本", availability: { "2026-11-02": ["晚上"] } },
}
const result: EnrichedMatchResult = {
  id: "pair", status: "draft", total_score: 78.2, best_slot: "2026-11-02_晚上", rank: 1,
  member_a: members[0], member_b: members[1], group_members: null, group_member_details: null,
  score_breakdown: [{ factor: "private_factor", label: "私密评分内容", rawScore: 0.5, weightedScore: 10, weight: 20 }],
}
function render(overrides: Partial<Parameters<typeof MatchingBoardDetails>[0]> = {}) {
  return renderToStaticMarkup(createElement(MatchingBoardDetails, {
    members, submissionPrefs, canViewRawSubmissions: true, result, onClose() {}, ...overrides,
  }))
}

describe("matching board member details", () => {
  it("compares the two selected people using submitted gender preferences and exact dated availability", () => {
    const html = render()
    expect(html).toContain("张三 &amp; 李四")
    expect(html).toContain("本人性别")
    expect(html).toContain("意向搭档性别")
    expect(html).toContain("本轮已选日期与时段")
    expect(html).toContain("2026-11-02")
    expect(html).toContain("下午、晚上")
    expect(html).not.toContain("周六晚")
    expect(html).not.toContain("档案性别偏好")
    expect(html).toContain("78.2")
    expect(html).toContain('href="/admin/members/张三"')
    expect(html).toContain("私密评分内容")
    expect(html).not.toContain("<details open")
  })

  it("does not expose raw submission or import fields or score details to ordinary admins, even if passed", () => {
    const withImport = { ...members[0], import_info: { source: "temp" as const, inferred: false, raw_first_choice: "私密志愿", raw_second_choice: null, script_activity_pref: null, raw_notes: "私密备注", warnings: [], legacy_profile: null } }
    const html = render({ members: [withImport, members[1]], canViewRawSubmissions: false })
    expect(html).not.toContain("本轮双人本")
    expect(html).not.toContain("本轮题材")
    expect(html).not.toContain("本轮社交风格")
    expect(html).not.toContain("私密评分内容")
    expect(html).not.toContain("私密志愿")
    expect(html).not.toContain("私密备注")
    expect(html).toContain("档案性别偏好")
    expect(html).toContain("周六晚")
    expect(html).toContain("非本轮已选时间")
    expect(html).toContain("78.2")
  })

  it("does not silently replace an explicitly empty round availability with profile preferences", () => {
    const html = render({ members: [members[0]], submissionPrefs: { 张三: { ...submissionPrefs.张三, availability: {} } }, result: undefined })
    expect(html).toContain("本轮未提供可用日期与时段")
    expect(html).not.toContain("周六晚")
    expect(html).not.toContain("共同时间")
  })

  it("marks fallback profile data and missing identity without inventing round answers", () => {
    const html = render({ members: [{ ...members[0], member_identity: null, member_boundaries: null }], submissionPrefs: {}, result: undefined })
    expect(html).toContain("未知成员")
    expect(html).toContain("未知")
    expect(html).toContain("未提供")
    expect(html).toContain("成员档案时间偏好，非本轮已选时间")
    expect(html).not.toContain("本轮已选日期与时段")
  })

  it("labels split-pair time and score as historical instead of an active match", () => {
    const html = render({ result: { ...result, status: "cancelled" } })
    expect(html).toContain("原配对时间")
    expect(html).toContain("原配对评分")
    expect(html).toContain("配对已解除")
    expect(html).not.toContain("共同时间")
  })
})
