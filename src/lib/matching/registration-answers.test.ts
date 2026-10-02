import { describe, expect, it } from "vitest"
import { registrationAnswersChanged } from "./registration-answers"
import type { RoundQuestion } from "@/types/matching-round"

const questions: RoundQuestion[] = [
  { id: "note", type: "text", label: { zh: "备注", ja: "" }, required: false, options: [] },
  { id: "meal", type: "single", label: { zh: "餐食", ja: "" }, required: false,
    options: [{ id: "yes", label: { zh: "需要", ja: "" } }, { id: "no", label: { zh: "不需要", ja: "" } }] },
  { id: "activities", type: "multi", label: { zh: "活动", ja: "" }, required: false,
    options: [{ id: "a", label: { zh: "桌游", ja: "" } }, { id: "b", label: { zh: "交流", ja: "" } }] },
]
const saved = { note: "原有备注", meal: "yes", activities: ["a", "b"] }

describe("registration answer change detection", () => {
  it("has no editable changes without visible questions, including unrelated legacy answers", () => {
    expect(registrationAnswersChanged([], { legacy: "before" }, { legacy: "after" })).toBe(false)
    expect(registrationAnswersChanged(questions, { ...saved, legacy: "before" }, { ...saved, legacy: "after" })).toBe(false)
  })

  it("treats unchanged answers, trimmed text and reordered multi-choice answers as unchanged", () => {
    expect(registrationAnswersChanged(questions, saved, saved)).toBe(false)
    expect(registrationAnswersChanged(questions, saved, { ...saved, note: "  原有备注\n", activities: ["b", "a"] })).toBe(false)
    expect(registrationAnswersChanged(questions, { ...saved, note: "  原有备注 " }, saved)).toBe(false)
  })

  it("treats untouched optional fields and their cleared empty forms equivalently", () => {
    expect(registrationAnswersChanged(questions, {}, { note: " \n", meal: "", activities: [] })).toBe(false)
    expect(registrationAnswersChanged(questions, { note: "", meal: "", activities: [] }, {})).toBe(false)
  })

  it.each([
    { ...saved, note: "更新后的备注" },
    { ...saved, note: "" },
    { ...saved, meal: "no" },
    { ...saved, meal: "" },
    { ...saved, activities: ["b"] },
    { ...saved, activities: [] },
  ])("recognizes a real answer change or clearing an existing answer", (changed) => {
    expect(registrationAnswersChanged(questions, saved, changed)).toBe(true)
    expect(registrationAnswersChanged(questions, saved, { ...saved })).toBe(false)
  })

  it("recognizes newly answered questions without mutating saved multi-choice order", () => {
    const previous = { activities: ["b", "a"] }, current = { activities: ["a", "b"], note: "新增备注" }
    expect(registrationAnswersChanged(questions, previous, { activities: current.activities })).toBe(false)
    expect(registrationAnswersChanged(questions, previous, current)).toBe(true)
    expect(previous.activities).toEqual(["b", "a"])
    expect(current.activities).toEqual(["a", "b"])
  })
})
