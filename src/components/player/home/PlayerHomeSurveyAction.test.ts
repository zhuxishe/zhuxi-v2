import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ window: vi.fn(), refresh: vi.fn(), refreshed: { current: null as string | null } }))
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useRef: () => mocks.refreshed,
  useEffect: (effect: () => void) => effect(),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))
vi.mock("@/lib/matching/use-survey-window", () => ({ useSurveyWindow: mocks.window }))
import { PlayerHomeSurveyAction } from "./PlayerHomeSurveyAction"

const action = { eyebrow: "next", title: "survey", description: "description", href: "/app/matching/survey", cta: "fill" }
const fallbackAction = { ...action, title: "profile", href: "/app/profile/edit", cta: "complete" }
const props = {
  action, fallbackAction, hasSubmitted: false, initialNow: "2026-09-29T01:00:00Z",
  round: { id: "round", status: "open", survey_start: "2026-09-29T00:00:00Z", survey_end: "2026-09-29T09:00:00Z" },
}

describe("homepage survey availability", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.refreshed.current = null
    mocks.window.mockReturnValue("open")
  })
  it("shows the survey action while the selected round accepts answers", () => {
    const view = PlayerHomeSurveyAction(props)
    expect(view.props.children[0].props.action).toEqual(action)
    expect(view.props.children[1]).toBe(false)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
  it("falls back immediately at expiry and refreshes once to discover another open round", () => {
    mocks.window.mockReturnValue("expired")
    const view = PlayerHomeSurveyAction(props)
    expect(view.props.children[0].props.action).toEqual(fallbackAction)
    expect(view.props.children[1]).toBe(false)
    PlayerHomeSurveyAction(props)
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })
  it("offers submitted users an ordinary edit link without replacing their next action", () => {
    const view = PlayerHomeSurveyAction({ ...props, action: fallbackAction, hasSubmitted: true })
    expect(view.props.children[0].props.action).toEqual(fallbackAction)
    expect(view.props.children[1].props.href).toBe("/app/matching/survey")
    mocks.window.mockReturnValue("expired")
    expect(PlayerHomeSurveyAction({ ...props, hasSubmitted: true }).props.children[1]).toBe(false)
  })
  it("keeps the usual action when there is no available survey", () => {
    mocks.window.mockReturnValue("closed")
    const view = PlayerHomeSurveyAction({ ...props, action: fallbackAction, round: null })
    expect(view.props.children[0].props.action).toEqual(fallbackAction)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
