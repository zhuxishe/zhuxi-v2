import { afterEach, describe, expect, it, vi } from "vitest"
import { normalizeRoundConfig } from "./round-config"
import { buildRoundSubmissionCsv, customAnswerText, submissionIdentity } from "./round-submission-export"

const config = normalizeRoundConfig({ questions: [{ id: "food", type: "multi", label: { zh: "饮食选择", ja: "" }, required: false, options: [{ id: "veg", label: { zh: "素食", ja: "" } }] }] })

afterEach(() => vi.unstubAllEnvs())

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
    expect(csv).toContain('"成员 ID","姓名","学校","提交时间"')
    expect(csv).toContain('"member-1"')
    expect(csv).toContain('"2026-09-29T00:00:00Z"')
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

  it.each(["UTC", "America/Los_Angeles", "Asia/Tokyo"])("exports Tokyo seconds independently of the browser timezone (%s)", (zone) => {
    vi.stubEnv("TZ", zone)
    const csv = buildRoundSubmissionCsv([
      { created_at: "2026-10-30T09:58:37.478936+00:00" },
      { created_at: "2026-10-30T19:58:37.999999+09:00" },
      { created_at: "2026-10-30T15:00:00Z" },
      { created_at: "2026-12-31T15:01:02Z" },
    ], normalizeRoundConfig({}), "matching")
    const submittedTimes = csv.split("\r\n").slice(1).map((line) => line.split(",")[3])
    expect(submittedTimes).toEqual(['"2026-10-30 18:58:37"', '"2026-10-30 19:58:37"', '"2026-10-31 00:00:00"', '"2027-01-01 00:01:02"'])
  })

  it.each([false, true])("reads the actual member number from the relation (array=%s)", (array) => {
    const member = { member_number: "ZXS_016", member_identity: { full_name: "测试甲", school_name: "测试学校" } }
    const csv = buildRoundSubmissionCsv([{ member_id: "internal-uuid", member: array ? [member] : member,
      created_at: "2026-10-30T10:58:37.478936+00:00" }], normalizeRoundConfig({}), "matching")
    expect(csv.split("\r\n")[0]).toBe('\uFEFF"成员编号","姓名","学校","提交时间","游戏类型","搭档性别偏好","可用时间","兴趣题材","社交风格","留言"')
    expect(csv.split("\r\n")[1]).toContain('"ZXS_016","测试甲","测试学校","2026-10-30 19:58:37"')
    expect(csv).not.toContain("internal-uuid")
  })

  it.each([undefined, null, {}, [], { member_number: null }])("leaves an absent member number blank instead of exposing UUID: %j", (member) => {
    const csv = buildRoundSubmissionCsv([{ member_id: "internal-uuid", member }], normalizeRoundConfig({}), "matching")
    expect(csv.split("\r\n")[1].split(",")[0]).toBe('""')
    expect(csv).not.toContain("internal-uuid")
  })

  it.each([null, undefined, "", "invalid", "2026-10-30T09:58:37"])("does not invent a submission timestamp for %j", (created_at) => {
    const csv = buildRoundSubmissionCsv([{ created_at }], normalizeRoundConfig({}), "matching")
    expect(csv.split("\r\n")[1].split(",")[3]).toBe('""')
  })
})
