import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { InterviewQuestionnairePanel } from "./InterviewQuestionnairePanel"
import { buildDefaultTemplate } from "@/lib/questionnaires/defaults"
import type { InterviewQuestionnaire } from "@/types/interview-questionnaire"

const render = (questionnaire: InterviewQuestionnaire | null) => renderToStaticMarkup(createElement(InterviewQuestionnairePanel, { questionnaire }))

describe("interview answer display", () => {
  it("uses stored option labels and preserves false, zero, multiline and disabled saved answers", () => {
    const template = buildDefaultTemplate("interview")
    template.questions = [
      { id: "fee", sectionId: "basic", type: "single", label: { zh: "是否申请社团费用免除", ja: "" }, active: true, required: false, locked: false, options: [{ id: "yes", value: "stored_yes", label: { zh: "申请", ja: "" } }] },
      { id: "false", sectionId: "basic", type: "single", label: { zh: "布尔回答", ja: "" }, active: true, required: false, locked: false },
      { id: "zero", sectionId: "basic", type: "number", label: { zh: "数字回答", ja: "" }, active: true, required: false, locked: false },
      { id: "notes", sectionId: "basic", type: "textarea", label: { zh: "历史补充", ja: "" }, active: false, required: false, locked: false },
      { id: "hidden", sectionId: "basic", type: "text", label: { zh: "停用未答题", ja: "" }, active: false, required: false, locked: false },
      { id: "empty", sectionId: "basic", type: "multi", label: { zh: "未答题", ja: "" }, active: true, required: false, locked: false },
    ]
    const html = render({ status: "submitted", template, answers: { fee: "stored_yes", false: false, zero: 0, notes: "第一行\n<script>第二行</script>", empty: [] }, version: 2, submittedAt: "2026-11-01T18:00:00Z" })
    for (const text of ["是否申请社团费用免除", "申请</dd>", "否</dd>", "0</dd>", "第一行\n&lt;script&gt;第二行&lt;/script&gt;", "未填写", "第 2 版", "2026-11-02 03:00"]) expect(html).toContain(text)
    expect(html).not.toContain("停用未答题")
    expect(html).not.toContain("stored_yes")
  })

  it("labels reconstructed historical data and does not claim the current template was answered", () => {
    const html = render({ status: "legacy", template: buildDefaultTemplate("interview"), answers: { full_name: "历史姓名" }, version: null, submittedAt: null })
    expect(html).toContain("历史资料整理")
    expect(html).toContain("可能包含后续更正")
    expect(html).toContain("历史姓名")
    expect(html).not.toContain("提交时间")
    expect(html).not.toContain("按玩家填写时")
  })

  it.each([
    [{ status: "draft" }, "尚未提交"],
    [{ status: "missing" }, "暂无面试前信息表记录"],
    [{ status: "unavailable" }, "已匿名化"],
    [null, "答卷加载失败"],
  ] as const)("renders status %j distinctly", (data, message) => {
    expect(render(data)).toContain(message)
  })
})
