import { describe, expect, it } from "vitest"
import { normalizeRoundConfig } from "./round-config"
import { buildRoundSubmissionCsv, customAnswerText, submissionIdentity } from "./round-submission-export"

const config = normalizeRoundConfig({ questions: [{ id: "food", type: "multi", label: { zh: "饮食选择", ja: "" }, required: false, options: [{ id: "veg", label: { zh: "素食", ja: "" } }] }] })

describe("round submission export", () => {
  it("resolves stable option ids and keeps plain text answers", () => {
    expect(customAnswerText(config.questions[0], ["veg"])).toBe("素食")
    expect(customAnswerText({ ...config.questions[0], type: "text", options: [] }, "需要无障碍入口")).toBe("需要无障碍入口")
    expect(customAnswerText(config.questions[0], undefined)).toBe("")
  })

  it("supports both relation shapes without using names as record ids", () => {
    expect(submissionIdentity({ member: [{ member_identity: [{ full_name: "甲", school_name: "学校" }] }] })).toEqual({ name: "甲", school: "学校" })
  })

  it("exports registration without matching-only questions and neutralizes spreadsheet formulas", () => {
    const csv = buildRoundSubmissionCsv([{ member_id: "member-1", created_at: "2026-09-29T00:00:00Z", member: { member_identity: { full_name: '=HYPERLINK("https://example.com")', school_name: "学校,东京" } }, custom_answers: { food: ["veg"] } }], config, "registration")
    expect(csv).toContain('"\'=HYPERLINK(""https://example.com"")"')
    expect(csv).toContain('"学校,东京"')
    expect(csv).toContain('"素食"')
    expect(csv).not.toContain("搭档性别偏好")
  })

  it("retains cancelled registration answers with explicit status and cancellation time", () => {
    const csv = buildRoundSubmissionCsv([
      { member_id: "active", cancelled_at: null },
      { member_id: "cancelled", cancelled_at: "2026-09-29T01:00:00Z", custom_answers: { food: ["veg"] } },
    ], config, "registration")
    expect(csv).toContain('"报名状态","取消时间"')
    expect(csv).toContain('"有效报名",""')
    expect(csv).toContain('"已取消","2026-09-29T01:00:00Z","素食"')
    expect(csv.split("\r\n")).toHaveLength(3)
  })

  it.each(["+1", "-2", "@SUM(A1)", "\t=1", "\r=1", "  =1"])("neutralizes dangerous text %j", (name) => {
    const csv = buildRoundSubmissionCsv([{ member_id: "id", member: { member_identity: { full_name: name } } }], normalizeRoundConfig({}), "registration")
    expect(csv).toContain(`"'${name}"`)
  })

  it("includes availability and original matching answers in matching exports", () => {
    const csv = buildRoundSubmissionCsv([{ member_id: "id", availability: { "2026-10-10": ["下午"] }, interest_tags: ["推理"] }], normalizeRoundConfig({}), "matching")
    expect(csv).toContain("可用时间")
    expect(csv).toContain("2026-10-10")
    expect(csv).toContain("推理")
    expect(csv).not.toContain("报名状态")
    expect(csv).not.toContain("取消时间")
  })
})
