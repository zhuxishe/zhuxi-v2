import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { answersFromLegacy, buildDefaultTemplate } from "@/lib/questionnaires/defaults"
import { buildSupplementaryDraft } from "@/lib/forms/player-enrichment"
import type { QuestionnaireRuntime } from "@/lib/questionnaires/types"

const state = vi.hoisted(() => ({ locale: "zh" as "zh" | "ja" }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }) }))
vi.mock("next-intl", async () => {
  const zh = (await import("@/messages/zh.json")).default
  const ja = (await import("@/messages/ja.json")).default
  return {
    NextIntlClientProvider: ({ children }: { children: import("react").ReactNode }) => children,
    useLocale: () => state.locale,
    useTranslations: (group: string) => Object.assign((key: string) => (state.locale === "ja" ? ja : zh)[group as keyof typeof zh][key as never] ?? key, { has: () => true }),
  }
})
vi.mock("@/app/app/profile/supplementary/actions", () => ({ submitSupplementary: vi.fn() }))
vi.mock("@/app/app/profile/personality/actions", () => ({ submitPersonality: vi.fn() }))
vi.mock("@/components/ui/SchoolSearchSelect", () => ({ SchoolSearchSelect: () => createElement("input", { "data-control": "school-search" }) }))
vi.mock("@/components/ui/MajorSearchSelect", () => ({ MajorSearchSelect: () => createElement("input", { "data-control": "major-search" }) }))

import { QuestionnaireField, QuestionnaireFields, questionnaireText } from "./QuestionnaireFields"
import { SupplementaryForm } from "./SupplementaryForm"
import { SupplementaryStep1 } from "./SupplementaryStep1"
import { SupplementaryStep2 } from "./SupplementaryStep2"
import { SupplementaryStep3 } from "./SupplementaryStep3"
import { SupplementaryStep4 } from "./SupplementaryStep4"
import { PersonalitySelfAssessment } from "./PersonalitySelfAssessment"

const supplementarySource = {
  activity_area: "池袋", nearest_station: "新宿", graduation_year: 2027,
  communication_language_pref: ["中文", "日语"], japanese_level: "N2",
  game_type_pref: "都可以", scenario_mode_pref: ["推理本", "欢乐本"], scenario_theme_tags: ["推理"],
  ideal_group_size: "4-10人", script_preference: ["新本"], non_script_preference: ["桌游", "聚餐"],
  activity_frequency: "每月1次", preferred_time_slots: ["周六白天"], budget_range: "~2000円", travel_radius: "1小时以内",
  social_goal_primary: "认识新朋友", social_goal_secondary: "找固定玩伴", accept_beginners: false, accept_cross_school: true,
}

describe.each(["zh", "ja"] as const)("existing questionnaire compatibility in %s", (locale) => {
  it("renders a real station search with nullable imported baseline answers", () => {
    state.locale = locale
    const template = buildDefaultTemplate("supplementary")
    const source = Object.fromEntries(template.questions.map((question) => [question.id, null]))
    const questionnaire: QuestionnaireRuntime = { kind: "supplementary", template, versionId: "baseline", revision: 1, isBaseline: true, completed: true, answers: answersFromLegacy(template, source) }
    const props = { memberId: "synthetic-member", existingInterests: source, existingLanguage: source }
    const original = renderToStaticMarkup(createElement(SupplementaryForm, props))
    expect(() => renderToStaticMarkup(createElement(SupplementaryForm, { ...props, questionnaire }))).not.toThrow()
    expect(renderToStaticMarkup(createElement(SupplementaryForm, { ...props, questionnaire }))).toBe(original)
    expect(original).toContain('placeholder="駅名を入力して検索"')
  })

  it.each([
    [0, SupplementaryStep1], [1, SupplementaryStep2], [2, SupplementaryStep3], [3, SupplementaryStep4],
  ] as const)("keeps step %i controls, labels, spacing and configured selections", (step, Step) => {
    state.locale = locale
    const template = buildDefaultTemplate("supplementary")
    const data = buildSupplementaryDraft(supplementarySource, supplementarySource)
    const original = renderToStaticMarkup(createElement(Step, { data, setField: vi.fn() }))
    const published = renderToStaticMarkup(createElement(QuestionnaireFields, { template, answers: answersFromLegacy(template, data), onChange: vi.fn(), sectionId: template.sections[step].id }))
    expect(published).toBe(original)
    expect(template.questions.find((question) => question.id === "graduation_year")!.options!.map((option) => option.value)).not.toContain("2024")
  })

  it.each([2024, 2026])("renders only configured graduation years in template order for saved year %i", (year) => {
    state.locale = locale
    const question = buildDefaultTemplate("supplementary").questions.find((item) => item.id === "graduation_year")!
    question.options = [2030, 2026, 2028].map((value) => ({ id: `year_${value}`, value: String(value), label: { zh: String(value), ja: String(value) } }))
    const before = JSON.stringify(question)
    const answers = { graduation_year: year }
    const onChange = vi.fn()
    const html = renderToStaticMarkup(createElement(QuestionnaireField, { question, value: answers.graduation_year, onChange, kind: "supplementary" }))
    const buttons = [...html.matchAll(/<button[^>]*class="([^"]*)"[^>]*>([^<]*)<\/button>/g)]
    expect(buttons.map((button) => button[2])).toEqual(["2030", "2026", "2028"])
    expect(buttons.filter((button) => button[1].includes("bg-primary text-primary-foreground")).map((button) => button[2])).toEqual(year === 2026 ? ["2026"] : [])
    expect(JSON.stringify(question)).toBe(before)
    expect(answers.graduation_year).toBe(year)
    expect(onChange).not.toHaveBeenCalled()
  })

  it.each(["4-5人", "6-7人", "8-10人"])("does not map saved group size %s to another configured option or rewrite it", (size) => {
    state.locale = locale
    const question = buildDefaultTemplate("supplementary").questions.find((item) => item.id === "ideal_group_size")!
    const before = JSON.stringify(question)
    const answers = { ideal_group_size: size }
    const onChange = vi.fn()
    const html = renderToStaticMarkup(createElement(QuestionnaireField, { question, value: answers.ideal_group_size, onChange, kind: "supplementary" }))
    const buttons = [...html.matchAll(/<button[^>]*class="([^"]*)"[^>]*>([^<]*)<\/button>/g)]
    expect(buttons.map((button) => button[2])).toEqual(question.options!.map((option) => questionnaireText(option.label, locale)))
    expect(buttons.every((button) => button[1].includes("bg-muted text-muted-foreground"))).toBe(true)
    expect(JSON.stringify(question)).toBe(before)
    expect(answers.ideal_group_size).toBe(size)
    expect(onChange).not.toHaveBeenCalled()
  })

  it("selects an explicitly published historical group-size option by its exact value", () => {
    state.locale = locale
    const template = buildDefaultTemplate("supplementary")
    template.questions.find((question) => question.id === "ideal_group_size")!.options!.push({ id: "extra_size", value: "6-7人", label: { zh: "新增人数选择", ja: "追加人数選択" } })
    const answers = { ideal_group_size: "6-7人" }
    const html = renderToStaticMarkup(createElement(QuestionnaireFields, { template, answers, onChange: vi.fn(), sectionId: "activities" }))
    const label = locale === "ja" ? "追加人数選択" : "新增人数选择"
    const selected = new RegExp(`<button[^>]*class="([^"]*)"[^>]*>${label}</button>`).exec(html)![1]
    const merged = /<button[^>]*class="([^"]*)"[^>]*>4-10人<\/button>/.exec(html)![1]
    expect(selected).toContain("bg-primary text-primary-foreground")
    expect(merged).toContain("bg-muted text-muted-foreground")
    expect(answers.ideal_group_size).toBe("6-7人")
  })

  it("keeps all ten personality card controls and wording identical to the original renderer", () => {
    state.locale = locale
    const source = {
      extroversion: 4, initiative: 2, emotional_stability: 5, expression_style_tags: ["温和", "幽默"], group_role_tags: ["组织者"],
      warmup_speed: "先浅后深", planning_style: "半计划", coop_compete_tendency: "偏合作", boundary_strength: "适中", reply_speed: "当天",
    }
    const template = buildDefaultTemplate("personality")
    const original = renderToStaticMarkup(createElement(PersonalitySelfAssessment, { existing: source }))
    const originalCards = /<fieldset[^>]*>([\s\S]*?)<\/fieldset>/.exec(original)![1]
    const published = renderToStaticMarkup(createElement(QuestionnaireFields, { template, answers: answersFromLegacy(template, source), onChange: vi.fn() }))
    expect(published.slice('<div class="space-y-6">'.length, -"</div>".length)).toBe(originalCards)
  })
})
