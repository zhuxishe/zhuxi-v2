import { isValidElement, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ submit: vi.fn(), push: vi.fn(), refresh: vi.fn(), state: vi.fn() }))
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useState: mocks.state }))
vi.mock("next/navigation", async (original) => ({ ...await original<typeof import("next/navigation")>(), useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }))
vi.mock("next-intl", () => ({ useTranslations: () => Object.assign((key: string) => key, { has: () => true }) }))
vi.mock("@/lib/i18n/use-tag-labels", () => ({ useTagLabels: () => ({}) }))
vi.mock("@/app/app/reviews/new/[id]/actions", () => ({ submitReview: mocks.submit }))
import { MutualReviewForm } from "./MutualReviewForm"
import { Button } from "@/components/ui/button"
type NodeProps = { children?: ReactNode; onClick?: () => Promise<void>; disabled?: boolean }
function find(node: ReactNode): NodeProps | undefined {
  if (Array.isArray(node)) return node.map(find).find(Boolean)
  if (!isValidElement<NodeProps>(node)) return
  return node.type === Button ? node.props : find(node.props.children)
}
let states: unknown[], cursor: number
const target = "30000000-0000-0000-0000-000000000002"
function button(withReturn = true) {
  cursor = 0
  const result = find(MutualReviewForm({ reviewerId: "self", revieweeId: "partner", matchResultId: "match", publicationVersion: 2,
    registrationReturn: withReturn ? { roundId: target, fromParticipation: true } : null }))
  if (!result?.onClick) throw new Error("Missing submit")
  return result as NodeProps & { onClick: () => Promise<void> }
}
describe("matching score save and registration return", () => {
  beforeEach(() => {
    vi.clearAllMocks(); states = []
    mocks.state.mockImplementation((initial: unknown) => {
      const index = cursor++
      if (!(index in states)) states[index] = initial
      return [states[index], (value: unknown) => { states[index] = value }]
    })
    mocks.submit.mockResolvedValue({ success: true })
  })
  it("returns to the original registration only after the score is saved", async () => {
    await button().onClick()
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith(`/app/matching/survey?round=${target}&from=participation`)
    expect(mocks.refresh).toHaveBeenCalledOnce()
    expect(mocks.submit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ match_result_id: "match", reviewee_id: "partner" }))
  })
  it("stays on the review with an enabled retry after network failure or rejected rating", async () => {
    mocks.submit.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ error: "matchPublicationChanged" })
    await button().onClick()
    expect(button().disabled).toBe(false)
    expect(mocks.push).not.toHaveBeenCalled()
    await button().onClick()
    expect(button().disabled).toBe(false)
    expect(mocks.push).not.toHaveBeenCalled()
  })
  it("preserves the ordinary review destination when no registration return was supplied", async () => {
    await button(false).onClick()
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith("/app")
  })
  it("preserves a session-expiry redirect instead of reporting a failed save", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/login?next=%2Fapp%2Freviews&reason=session_expired;307;",
    })
    mocks.submit.mockRejectedValueOnce(redirect)
    await expect(button().onClick()).rejects.toBe(redirect)
    expect(mocks.submit).toHaveBeenCalledOnce()
    expect(mocks.push).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(button().disabled).toBe(false)
  })
})
