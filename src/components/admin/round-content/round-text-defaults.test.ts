import { describe, expect, it } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { normalizeRoundConfig } from "@/lib/matching/round-config"
import { RoundCopyFields } from "./RoundCopyFields"
import { RoundModuleFields } from "./RoundModuleFields"
import { RoundTextField } from "./RoundTextField"
import { resolveRoundEditorText, roundCopyDefaults, roundLabelDefaults } from "./round-text-defaults"

const empty = { zh: "", ja: "" }
const noop = () => {}
const draft = { roundName: "秋季迎新派对", purpose: "matching" as const, contentConfig: normalizeRoundConfig({}) }

describe("round editor effective copy", () => {
  it("renders editable matching defaults without filling the saved configuration", () => {
    const before = JSON.stringify(draft.contentConfig)
    const html = renderToStaticMarkup(createElement(RoundCopyFields, { config: draft.contentConfig, purpose: "matching", roundName: draft.roundName, locale: "zh", onChange: noop }))
    expect(html).toContain('value="新一期匹配问卷已开放"')
    expect(html).toContain('value="填写问卷"')
    expect(html).toContain("告诉我们你最近的时间与偏好，开始寻找合适的伙伴</textarea>")
    expect(html).not.toContain("留空时使用默认内容")
    expect(JSON.stringify(draft.contentConfig)).toBe(before)
  })

  it("switches inherited copy by purpose and uses live activity names and introductions", () => {
    const registration = { ...draft, purpose: "registration" as const, contentConfig: normalizeRoundConfig({ introduction: { zh: "欢迎新朋友", ja: "" } }) }
    expect(roundCopyDefaults(registration, "zh")).toEqual({
      cardTitle: { text: "秋季迎新派对", source: "沿用轮次名称" },
      cardDescription: { text: "欢迎新朋友", source: "沿用活动介绍" },
      cardCta: { text: "查看并报名", source: "系统默认" },
    })
    expect(roundCopyDefaults({ ...registration, roundName: "十月交流会" }, "zh").cardTitle.text).toBe("十月交流会")
    expect(roundCopyDefaults({ ...registration, purpose: "announcement" }, "zh").cardCta.text).toBe("查看详情")
    expect(roundCopyDefaults({ ...registration, purpose: "matching" }, "zh").cardTitle.text).toBe("新一期匹配问卷已开放")
  })

  it("uses Japanese defaults and discloses inherited Chinese content", () => {
    expect(roundCopyDefaults(draft, "ja").cardTitle.text).toBe("新しいマッチング希望を受付中です")
    const registration = { ...draft, purpose: "registration" as const, contentConfig: normalizeRoundConfig({ titleJa: "秋の交流会", introduction: { zh: "活动介绍", ja: "" } }) }
    expect(roundCopyDefaults(registration, "ja").cardTitle).toEqual({ text: "秋の交流会", source: "沿用日文名称" })
    expect(roundCopyDefaults(registration, "ja").cardDescription).toEqual({ text: "活动介绍", source: "沿用中文活动介绍" })
    expect(resolveRoundEditorText({ zh: "我要参加", ja: "" }, "ja", "詳細・参加申込み")).toEqual({ text: "我要参加", source: "沿用中文" })
  })

  it("preserves both language overrides and resolves clearing only the current language", () => {
    const value = { zh: "本期匹配报名", ja: "今月の申込み" }
    expect(resolveRoundEditorText(value, "ja", "希望を入力")).toEqual({ text: "今月の申込み", source: "已自定义" })
    expect(resolveRoundEditorText({ ...value, ja: "" }, "ja", "希望を入力")).toEqual({ text: "本期匹配报名", source: "沿用中文" })
    expect(resolveRoundEditorText(empty, "ja", "希望を入力")).toEqual({ text: "希望を入力", source: "系统默认" })
    expect(value).toEqual({ zh: "本期匹配报名", ja: "今月の申込み" })
  })

  it("renders required matching labels and purpose-specific submit wording", () => {
    const html = renderToStaticMarkup(createElement(RoundModuleFields, { config: draft.contentConfig, locale: "zh", locked: false, onChange: noop }))
    for (const text of ["想玩什么类型？", "搭档性别偏好？", "你的可用时段", "提交问卷"]) expect(html).toContain(`value="${text}"`)
    expect(roundLabelDefaults("registration", "zh").submit).toBe("确认报名")
    expect(roundLabelDefaults("registration", "ja").submit).toBe("参加申込みを確定")
  })

  it("keeps fields without default content empty and gives specific instructions", () => {
    const html = renderToStaticMarkup(createElement(RoundTextField, { label: "地点", value: empty, locale: "zh", onChange: noop }))
    expect(html).toContain('value=""')
    expect(html).toContain('placeholder="请输入地点"')
    expect(html).not.toContain("恢复默认")
    expect(html).not.toContain("系统默认")
    expect(resolveRoundEditorText({ zh: "", ja: "質問" }, "zh", "", "", false).text).toBe("")
  })

  it("makes default resets non-submitting and labels each control independently", () => {
    const html = renderToStaticMarkup(createElement(RoundTextField, { label: "首页按钮文字", value: { zh: "立即填写", ja: "" }, locale: "zh", fallbackText: "填写问卷", onChange: noop }))
    expect(html).toContain('type="button"')
    expect(html).toContain('aria-label="首页按钮文字：恢复默认"')
    expect(html).toContain('value="立即填写"')
    expect(html).toContain("已自定义")
    expect(html).toMatch(/<label for="[^"]+"/)
  })
})
