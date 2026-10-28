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
function navigate(overrides: Record<string, unknown> = {}) {
  const event = {
    cancelable: true, canIntercept: true, hashChange: false,
    navigationType: "replace", userInitiated: false,
    destination: { url: window.location.href, sameDocument: true },
    preventDefault: vi.fn(), ...overrides,
  }
  handlers["navigation:navigate"](event)
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
  it("does not warn for untouched questionnaires during refresh or navigation", () => {
    useQuestionnaireUnsavedChanges("zh")
    navigate()
    navigate({ destination: { url: "https://www.zhuxishe.jp/app", sameDocument: true } })
    expect(confirm).not.toHaveBeenCalled()
  })
  it("allows repeated background refreshes while retaining the unsaved-answer guard", () => {
    const guard = useQuestionnaireUnsavedChanges("zh"); guard.markDirty()
    for (let index = 0; index < 3; index++) expect(navigate().preventDefault).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()

    const unload = { preventDefault: vi.fn(), returnValue: undefined }
    handlers["window:beforeunload"](unload)
    expect(unload.preventDefault).toHaveBeenCalledOnce()
    expect(unload.returnValue).toBe("")
    expect(click("https://www.zhuxishe.jp/app").preventDefault).toHaveBeenCalledOnce()
    expect(confirm).toHaveBeenCalledOnce()
    guard.markSaved()
    expect(navigate({ destination: { url: "https://www.zhuxishe.jp/app", sameDocument: true } }).preventDefault).not.toHaveBeenCalled()
    expect(confirm).toHaveBeenCalledOnce()
  })
  it.each(["push", "replace", "traverse"])("keeps same-page %s history updates silent without treating them as saved", (navigationType) => {
    const guard = useQuestionnaireUnsavedChanges("zh"); guard.markDirty()
    const event = navigate({ navigationType, destination: { url: `${window.location.href}#question`, sameDocument: true } })
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
    expect(guard.confirmLeave()).toBe(false)
    expect(confirm).toHaveBeenCalledOnce()
  })
  it.each([
    ["different path", "https://www.zhuxishe.jp/app"],
    ["different query", "https://www.zhuxishe.jp/app/profile/personality?matchingRound=another"],
    ["different origin", "https://other.test/app/profile/personality?matchingRound=round"],
  ])("still guards programmatic replace to a %s", (_description, url) => {
    const guard = useQuestionnaireUnsavedChanges("zh"); guard.markDirty()
    const event = navigate({ destination: { url, sameDocument: true } })
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(confirm).toHaveBeenCalledOnce()
  })
  it("blocks same-document history navigation to another page", () => {
    const guard = useQuestionnaireUnsavedChanges("zh"); guard.markDirty()
    const event = navigate({ navigationType: "traverse", destination: { url: "https://www.zhuxishe.jp/app/profile", sameDocument: true } })
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(confirm).toHaveBeenCalledOnce()
  })
  it.each([
    { navigationType: "reload" },
    { destination: { url: "https://www.zhuxishe.jp/app/profile/personality?matchingRound=round", sameDocument: false } },
    { destination: undefined },
    { destination: { url: "https://[invalid", sameDocument: true } },
  ])("does not mistake a reload or unknown document destination for an internal refresh: %j", (overrides) => {
    const guard = useQuestionnaireUnsavedChanges("zh"); guard.markDirty()
    expect(navigate(overrides).preventDefault).toHaveBeenCalledOnce()
    expect(confirm).toHaveBeenCalledOnce()
  })
  it("leaves non-interceptable reloads to the browser's beforeunload warning", () => {
    const guard = useQuestionnaireUnsavedChanges("zh"); guard.markDirty()
    expect(navigate({ navigationType: "reload", canIntercept: false }).preventDefault).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
    const event = { preventDefault: vi.fn(), returnValue: undefined }
    handlers["window:beforeunload"](event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.returnValue).toBe("")
  })
  it("preserves hash navigation without clearing dirty state", () => {
    const guard = useQuestionnaireUnsavedChanges("zh"); guard.markDirty()
    expect(navigate({ hashChange: true }).preventDefault).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
    expect(guard.confirmLeave()).toBe(false)
  })
  it("cleans up every listener when the questionnaire unmounts", () => {
    useQuestionnaireUnsavedChanges("zh"); cleanup?.()
    expect(remove).toHaveBeenCalledTimes(3)
    expect(remove).toHaveBeenCalledWith("click", handlers["document:click"], true)
  })
})
