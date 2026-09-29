import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it } from "vitest"
import zh from "@/messages/zh.json"
import ja from "@/messages/ja.json"
import { normalizeRoundConfig } from "@/lib/matching/round-config"
import type { RoundPurpose, SurveyAnswers } from "@/types/matching-round"
import { RoundFormFields } from "./RoundFormFields"
import { RoundDetails } from "./RoundDetails"

const value: SurveyAnswers = {
  gameTypePref: "都可以", genderPref: "都可以", availability: {}, interestTags: [],
  socialStyle: null, message: null, customAnswers: {},
}
function fields(purpose: RoundPurpose, rawConfig: unknown = {}, locale = "zh") {
  // eslint-disable-next-line react/no-children-prop -- next-intl requires children in its createElement props type.
  return renderToStaticMarkup(createElement(NextIntlClientProvider, { locale, messages: locale === "ja" ? ja : zh, timeZone: "Asia/Tokyo",
    children: createElement(RoundFormFields, { purpose, config: normalizeRoundConfig(rawConfig), activityStart: "2026-10-10", activityEnd: "2026-10-11", value, onChange: () => {} }) }))
}

describe("shared player and admin preview fields", () => {
  it("preserves all original matching modules and date choices by default", () => {
    const html = fields("matching")
    for (const expected of ["双人本", "搭档性别偏好", "你的可用时段", "10-10", "10-11", "感兴趣的题材", "社交风格", "想对工作人员说的话"]) {
      expect(html).toContain(expected)
    }
  })

  it("never asks a fixed activity for matching availability or preferences", () => {
    const html = fields("registration")
    expect(html).not.toContain("双人本")
    expect(html).not.toContain("你的可用时段")
    expect(html).not.toContain("textarea")
  })

  it("hides disabled optional modules while keeping mandatory time collection", () => {
    const html = fields("matching", { modules: { interests: false, social: false, message: false }, labels: { availability: { zh: "请选择有空的时间", ja: "" } } })
    expect(html).toContain("请选择有空的时间")
    expect(html).toContain("10-10")
    expect(html).not.toContain("感兴趣的题材")
    expect(html).not.toContain("textarea")
  })

  it("uses the configured question labels in Japanese", () => {
    const html = fields("registration", { questions: [{ id: "diet", type: "single", required: true,
      label: { zh: "餐饮偏好", ja: "食事の希望" }, options: [{ id: "vegan", label: { zh: "素食", ja: "ベジタリアン" } }] }] }, "ja")
    expect(html).toContain("食事の希望")
    expect(html).toContain("ベジタリアン")
    expect(html).toContain('type="radio"')
    expect(html).not.toContain("餐饮偏好")
  })

  it("renders no fields for announcements", () => {
    expect(fields("announcement")).toBe("")
  })

  it("renders detail copy as text and displays activity times in Japan time", () => {
    const config = normalizeRoundConfig({ titleJa: "秋の歓迎会", introduction: { zh: "<script>bad()</script>", ja: "" },
      eventStart: "2026-10-10T06:00:00.000Z", eventEnd: "2026-10-10T08:00:00.000Z", location: { zh: "东京", ja: "東京" } })
    // eslint-disable-next-line react/no-children-prop -- next-intl requires children in its createElement props type.
    const html = renderToStaticMarkup(createElement(NextIntlClientProvider, { locale: "ja", messages: ja, timeZone: "Asia/Tokyo",
      children: createElement(RoundDetails, { roundName: "秋季迎新派对", purpose: "registration", config, surveyEnd: "2026-10-09T09:00:00.000Z" }) }))
    expect(html).toContain("秋の歓迎会")
    expect(html).toContain("15:00")
    expect(html).toContain("東京")
    expect(html).toContain("&lt;script&gt;")
    expect(html).not.toContain("<script>")
  })
})
