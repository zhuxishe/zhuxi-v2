import { beforeEach, describe, expect, it, vi } from "vitest"
import { isValidElement, type MouseEvent, type ReactNode } from "react"
const mocks = vi.hoisted(() => ({ check: vi.fn(), push: vi.fn(), state: vi.fn(), ref: vi.fn() }))
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useState: mocks.state, useRef: mocks.ref }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock("@/app/app/matching/survey/profile-actions", () => ({ checkMatchingEntry: mocks.check }))
import { MatchingSurveyLink } from "./MatchingSurveyLink"
import { MatchingProfileDialog } from "./MatchingProfileDialog"
const id = "429eea31-9986-42a8-b2b9-67f792e07173"
const href = `/app/matching/survey?round=${id}&from=participation`
let states: unknown[], refs: { current: unknown }[], cursor: number, refCursor: number
function render(target = href) {
  cursor = 0; refCursor = 0
  return MatchingSurveyLink({ href: target, children: "报名" })
}
function children(tree = render()) { return tree.props.children as ReactNode[] }
function dialog() {
  const item = children().find((node) => isValidElement(node) && node.type === MatchingProfileDialog)
  if (!isValidElement<Parameters<typeof MatchingProfileDialog>[0]>(item)) throw new Error("Missing dialog")
  return item.props
}
function click(target = href, modifier = false) {
  const link = children(render(target))[0]
  if (!isValidElement<{ onClick: (event: MouseEvent<HTMLAnchorElement>) => void }>(link)) throw new Error("Missing link")
  const event = { defaultPrevented: false, button: 0, metaKey: modifier, preventDefault: vi.fn() } as unknown as MouseEvent<HTMLAnchorElement>
  link.props.onClick(event)
  return event
}
describe("matching entry interaction", () => {
  beforeEach(() => {
    vi.resetAllMocks(); states = []; refs = []
    mocks.state.mockImplementation((initial: unknown) => {
      const index = cursor++; if (!(index in states)) states[index] = initial
      return [states[index], (value: unknown) => { states[index] = value }]
    })
    mocks.ref.mockImplementation((initial: unknown) => { const index = refCursor++; return refs[index] ??= { current: initial } })
    mocks.check.mockResolvedValue({ state: "incomplete", roundId: id, missing: ["supplementary", "quiz"] })
  })
  it("stays on the original page, lists all missing profiles, and cancel does not navigate", async () => {
    expect(click().preventDefault).toHaveBeenCalledOnce(); await Promise.resolve()
    expect(dialog()).toMatchObject({ open: true, missing: ["supplementary", "quiz"] })
    dialog().onCancel(); expect(dialog().open).toBe(false)
    expect(mocks.push).not.toHaveBeenCalled()
  })
  it("preserves the exact round and participation source when completing profiles", async () => {
    click(); await Promise.resolve(); dialog().onComplete()
    expect(mocks.push).toHaveBeenCalledWith(`/app/profile/complete?round=${id}&from=participation`)
  })
  it("opens the original survey only after a successful check", async () => {
    mocks.check.mockResolvedValue({ state: "continue" }); click(); await Promise.resolve()
    expect(mocks.push).toHaveBeenCalledWith(href)
  })
  it("fails closed and can retry a read failure", async () => {
    mocks.check.mockRejectedValueOnce(new Error("offline")); click(); await Promise.resolve()
    expect(dialog()).toMatchObject({ open: true, failed: true, missing: [] })
    expect(mocks.push).not.toHaveBeenCalled()
    dialog().onRetry(); await Promise.resolve()
    expect(dialog().missing).toEqual(["supplementary", "quiz"])
  })
  it("does not intercept unrelated links or modified clicks", () => {
    expect(click("/app/profile").preventDefault).not.toHaveBeenCalled()
    expect(click(href, true).preventDefault).not.toHaveBeenCalled()
    expect(mocks.check).not.toHaveBeenCalled()
  })
})
