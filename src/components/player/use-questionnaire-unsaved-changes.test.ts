import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ effect: vi.fn() }))
vi.mock("react", () => ({ useCallback: (callback: unknown) => callback, useRef: (initial: unknown) => ({ current: initial }), useEffect: mocks.effect }))
import { useQuestionnaireUnsavedChanges } from "./use-questionnaire-unsaved-changes"

type Handler = (event: Record<string, unknown>) => void
let handlers: Record<string, Handler>
let cleanup: (() => void) | undefined
let confirm: ReturnType<typeof vi.fn>
let remove: ReturnType<typeof vi.fn>
class Target {
  constructor(public anchor: { href: string; target: string; hasAttribute: () => boolean }) {}
  closest() { return this.anchor }
}
function click(href: string, overrides: Record<string, unknown> = {}) {
  const event = { target: new Target({ href, target: "", hasAttribute: () => false }), defaultPrevented: false, button: 0, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(), ...overrides }
  handlers["document:click"](event)
  return event
}
beforeEach(() => {
  vi.clearAllMocks(); handlers = {}; cleanup = undefined; confirm = vi.fn(() => false); remove = vi.fn()
  const surface = (prefix: string) => ({ addEventListener: (name: string, callback: Handler) => { handlers[`${prefix}:${name}`] = callback }, removeEventListener: remove })
  vi.stubGlobal("window", { ...surface("window"), location: new URL("https://www.zhuxishe.jp/app/profile/personality?matchingRound=round"), confirm, navigation: surface("navigation") })
  vi.stubGlobal("document", surface("document"))
  vi.stubGlobal("Element", Target)
  mocks.effect.mockImplementation((effect: () => () => void) => { cleanup = effect() })
})
afterEach(() => vi.unstubAllGlobals())

describe("questionnaire unsaved-answer guard", () => {
  it("warns on refresh/close only after an answer changes, and stops after a successful save", () => {
    const guard = useQuestionnaireUnsavedChanges("zh")
    const event = { preventDefault: vi.fn(), returnValue: undefined }
    handlers["window:beforeunload"](event)
    expect(event.preventDefault).not.toHaveBeenCalled()
    guard.markDirty()
    handlers["window:beforeunload"](event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.returnValue).toBe("")
    guard.markSaved()
    handlers["window:beforeunload"](event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
  })
  it("keeps the current questionnaire when leaving through an in-page link is cancelled", () => {
    const guard = useQuestionnaireUnsavedChanges("zh"); guard.markDirty()
    const event = click("https://www.zhuxishe.jp/app")
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("尚未提交"))
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce()
    expect(guard.confirmLeave()).toBe(false)
  })
  it("allows confirmed navigation without a second beforeunload warning", () => {
    const guard = useQuestionnaireUnsavedChanges("ja"); guard.markDirty(); confirm.mockReturnValue(true)
    expect(click("https://www.zhuxishe.jp/app").preventDefault).not.toHaveBeenCalled()
    const event = { preventDefault: vi.fn() }
    handlers["window:beforeunload"](event)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(confirm).toHaveBeenCalledOnce()
  })
  it("does not warn for same-page anchors or opening another tab", () => {
    const guard = useQuestionnaireUnsavedChanges("zh"); guard.markDirty()
    click("https://www.zhuxishe.jp/app/profile/personality?matchingRound=round#question")
    click("https://www.zhuxishe.jp/app", { ctrlKey: true })
    click("https://www.zhuxishe.jp/app", { target: new Target({ href: "https://www.zhuxishe.jp/app", target: "_blank", hasAttribute: () => false }) })
    expect(confirm).not.toHaveBeenCalled()
  })
  it("does not mistake an external page with the same path for the current page", () => {
    const guard = useQuestionnaireUnsavedChanges("zh"); guard.markDirty()
    expect(click("https://other.test/app/profile/personality?matchingRound=round").preventDefault).toHaveBeenCalledOnce()
  })
  it("blocks same-document history navigation in browsers supporting the Navigation API", () => {
    const guard = useQuestionnaireUnsavedChanges("zh"); guard.markDirty()
    const event = { cancelable: true, canIntercept: true, preventDefault: vi.fn() }
    handlers["navigation:navigate"](event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(confirm).toHaveBeenCalledOnce()
  })
  it("cleans up every listener when the questionnaire unmounts", () => {
    useQuestionnaireUnsavedChanges("zh"); cleanup?.()
    expect(remove).toHaveBeenCalledTimes(3)
    expect(remove).toHaveBeenCalledWith("click", handlers["document:click"], true)
  })
})
