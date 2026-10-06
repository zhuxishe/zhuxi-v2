import { createElement, isValidElement, type InputHTMLAttributes, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { activityReviewCopy } from "@/lib/activity-reviews/copy"

vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useId: () => "score-test" }))
import { ActivityReviewScorePicker } from "./ActivityReviewScorePicker"

type InputProps = InputHTMLAttributes<HTMLInputElement>
function findRange(node: ReactNode): InputProps | undefined {
  if (Array.isArray(node)) return node.map(findRange).find(Boolean)
  if (!isValidElement<InputProps>(node)) return
  return node.type === "input" && node.props.type === "range" ? node.props : findRange(node.props.children)
}
function render(value: number | null, onChange = vi.fn(), disabled = false) {
  const range = findRange(ActivityReviewScorePicker({ value, onChange, disabled, copy: activityReviewCopy("zh") }))
  if (!range) throw new Error("Score range is missing")
  return range
}
function change(range: InputProps, score: number) {
  range.onChange?.({ currentTarget: { valueAsNumber: score } } as Parameters<NonNullable<InputProps["onChange"]>>[0])
}

describe("activity review score slider", () => {
  it("keeps the neutral thumb position unselected until the player interacts", () => {
    const onChange = vi.fn()
    const range = render(null, onChange)
    expect(onChange).not.toHaveBeenCalled()
    expect(range["aria-valuetext"]).toBe("请选择评分")
    expect(range).toMatchObject({ min: 1, max: 5, step: 0.5, value: 3 })
    const html = renderToStaticMarkup(createElement(ActivityReviewScorePicker, { value: null, onChange, copy: activityReviewCopy("ja") }))
    expect(html).toContain("点数を選択してください")
    expect(html).toContain('data-unselected="true"')
    expect(html).not.toContain('name="score-test-score"')
  })

  it("emits all nine exact numeric half-point scores synchronously", () => {
    const onChange = vi.fn()
    const range = render(null, onChange)
    for (const score of [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]) change(range, score)
    expect(onChange.mock.calls).toEqual([[1], [1.5], [2], [2.5], [3], [3.5], [4], [4.5], [5]])
  })

  it("can explicitly select the untouched center with a pointer or keyboard", () => {
    const onChange = vi.fn()
    const range = render(null, onChange)
    range.onPointerUp?.({ currentTarget: { valueAsNumber: 3 } } as Parameters<NonNullable<InputProps["onPointerUp"]>>[0])
    for (const key of ["Enter", " "]) {
      const preventDefault = vi.fn()
      range.onKeyDown?.({ key, preventDefault } as unknown as Parameters<NonNullable<InputProps["onKeyDown"]>>[0])
      expect(preventDefault).toHaveBeenCalledOnce()
    }
    expect(onChange.mock.calls).toEqual([[3], [3], [3]])
  })

  it("retains native arrow, Home and End handling and does not select merely on focus", () => {
    const onChange = vi.fn()
    const range = render(null, onChange)
    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Tab"]) {
      const preventDefault = vi.fn()
      range.onKeyDown?.({ key, preventDefault } as unknown as Parameters<NonNullable<InputProps["onKeyDown"]>>[0])
      expect(preventDefault).not.toHaveBeenCalled()
    }
    expect(onChange).not.toHaveBeenCalled()
    expect(range.onFocus).toBeUndefined()
  })

  it.each([1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5])("restores a saved %s with a matching accessible value", (score) => {
    const range = render(score)
    expect(range.value).toBe(score)
    expect(range["aria-valuetext"]).toBe(`${score.toFixed(1)} 分`)
  })

  it("ignores unchanged values and values the submission API cannot accept", () => {
    const onChange = vi.fn()
    const range = render(4.5, onChange)
    for (const score of [4.5, 0, 0.5, 4.3, 5.5, NaN, Infinity]) change(range, score)
    expect(onChange).not.toHaveBeenCalled()
  })

  it("does not change a locked review through any selection handler", () => {
    const onChange = vi.fn()
    const range = render(null, onChange, true)
    change(range, 4.5)
    range.onPointerUp?.({ currentTarget: { valueAsNumber: 3 } } as Parameters<NonNullable<InputProps["onPointerUp"]>>[0])
    range.onKeyDown?.({ key: "Enter", preventDefault: vi.fn() } as unknown as Parameters<NonNullable<InputProps["onKeyDown"]>>[0])
    expect(range.disabled).toBe(true)
    expect(onChange).not.toHaveBeenCalled()
  })
})
