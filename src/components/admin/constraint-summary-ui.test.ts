import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { ConstraintChecklist } from "./ConstraintChecklist"
import type { EnrichedMember } from "./match-detail-types"
function member(id: string, gender: string): EnrichedMember {
  return { id, record_source: null, member_interests: null, member_personality: null, member_boundaries: null, member_identity: { full_name: id, nickname: null, school_name: null, gender, hobby_tags: [], nationality: "", degree_level: null, department: null } }
}
describe("saved match card summaries", () => {
  it("does not advertise whole-pool approval from a gender distribution or an A-B relationship", () => {
    const groupMembers = [member("A", "male"), member("B", "female"), member("C", "female")]
    const html = renderToStaticMarkup(createElement(ConstraintChecklist, { memberA: groupMembers[0], memberB: null, groupMembers, bestSlot: "2026-10-25_晚", pairRel: { member_a_id: "A", member_b_id: "B", pair_count: 0, status: "normal", avg_score: null } }))
    expect(html).toContain("原批资料摘要；人工调整以对应操作快照为准")
    expect(html).toContain("不代表当前资格或整池硬约束已通过")
    expect(html).toContain("未展示池内所有成员关系")
    expect(html).not.toContain("约束检查")
    expect(html).not.toContain("text-green")
    expect(html).not.toContain("bg-green")
  })
  it("labels a saved slot and individual preferences as facts instead of rechecking old results", () => {
    const html = renderToStaticMarkup(createElement(ConstraintChecklist, { memberA: member("A", "male"), memberB: member("B", "female"), bestSlot: "2026-10-25_晚", submissionPrefs: { A: { game_type_pref: "多人", gender_pref: "女" }, B: { game_type_pref: "都可以", gender_pref: "男" } } }))
    expect(html).toContain("A(男) · 偏好：女")
    expect(html).toContain("A：多人")
    expect(html).toContain("已保存时段")
    expect(html).not.toContain("✓")
    expect(html).not.toContain("性别兼容")
  })
})
