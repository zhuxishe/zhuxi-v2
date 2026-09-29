import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ setState: vi.fn(), effect: vi.fn() }))
vi.mock("react", () => ({
  useState: (initial: () => unknown) => [initial(), mocks.setState],
  useEffect: mocks.effect,
}))
import { useSurveyWindow } from "./use-survey-window"

const round = { status: "open", survey_start: "2026-09-29T00:00:00Z", survey_end: "2026-09-29T01:00:01Z" }
let cleanup: () => void

describe("survey boundary updates in a mounted page", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime("2026-09-29T01:00:00Z")
    vi.stubGlobal("window", new EventTarget())
    vi.stubGlobal("document", new EventTarget())
    mocks.effect.mockImplementation((effect: () => () => void) => { cleanup = effect() })
  })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

  it("disables an open window at its deadline without reloading the page", () => {
    expect(useSurveyWindow(round, new Date().toISOString())).toBe("open")
    vi.advanceTimersByTime(0)
    expect(mocks.setState).toHaveBeenLastCalledWith("open")
    vi.advanceTimersByTime(1001)
    expect(mocks.setState).toHaveBeenLastCalledWith("expired")
  })

  it("rechecks immediately when a suspended tab becomes visible", () => {
    useSurveyWindow(round, new Date().toISOString())
    vi.setSystemTime("2026-09-29T02:00:00Z")
    document.dispatchEvent(new Event("visibilitychange"))
    expect(mocks.setState).toHaveBeenLastCalledWith("expired")
  })

  it("removes timers and focus listeners when the page is unmounted", () => {
    useSurveyWindow(round, new Date().toISOString())
    cleanup()
    expect(vi.getTimerCount()).toBe(0)
    mocks.setState.mockClear()
    window.dispatchEvent(new Event("focus"))
    expect(mocks.setState).not.toHaveBeenCalled()
  })
})
