import { isValidElement, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ state: vi.fn(), review: vi.fn(), refresh: vi.fn(), push: vi.fn() }))
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useState: mocks.state }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }) }))
vi.mock("next-intl", () => ({ useTranslations: () => Object.assign((key: string) => key, { has: () => true }) }))
vi.mock("@/lib/i18n/use-tag-labels", () => ({ useTagLabels: () => ({}) }))
vi.mock("@/app/app/reviews/new/[id]/actions", () => ({ submitReview: mocks.review }))
import { MutualReviewForm } from "./MutualReviewForm"

type Props = { children?: ReactNode; value?: string; onClick?: () => unknown; onSubmit?: (event: { preventDefault: () => void }) => unknown; onChange?: (event: { target: { value: string } }) => void }
function find(node: ReactNode, predicate: (node: { type: unknown; props: Props }) => boolean): Props | undefined {
  if (Array.isArray(node)) return node.map((item) => find(item, predicate)).find(Boolean)
  if (!isValidElement<Props>(node)) return
  return predicate(node) ? node.props : find(node.props.children, predicate)
}
function content(node: ReactNode): string {
  if (typeof node === "string") return node
  if (Array.isArray(node)) return node.map(content).join("")
  return isValidElement<Props>(node) ? content(node.props.children) : ""
}
let states: unknown[], cursor: number
function reviewForm() { cursor = 0; return MutualReviewForm({ reviewerId: "me", revieweeId: "partner", matchResultId: "result", publicationVersion: 2 }) }

beforeEach(() => {
  vi.clearAllMocks(); states = []; cursor = 0
  mocks.state.mockImplementation((initial: unknown) => {
    const index = cursor++
    if (!(index in states)) states[index] = initial
    return [states[index], (value: unknown) => { states[index] = typeof value === "function" ? value(states[index]) : value }]
  })
})

describe("publication conflicts preserve the existing input workflow", () => {
  it("keeps an entered mutual review and sends the displayed version when a publication changes", async () => {
    mocks.review.mockResolvedValue({ error: "matchPublicationChanged" })
    find(reviewForm(), (node) => node.type === "textarea")?.onChange?.({ target: { value: "这段互评不能丢失" } })
    await find(reviewForm(), (node) => node.props.children === "submit")?.onClick?.()
    expect(mocks.review).toHaveBeenCalledWith(expect.objectContaining({ expected_publication_version: 2, comment: "这段互评不能丢失" }))
    const tree = reviewForm()
    expect(find(tree, (node) => node.type === "textarea")?.value).toBe("这段互评不能丢失")
    expect(content(tree)).toContain("matchPublicationChanged")
    expect(mocks.push).not.toHaveBeenCalled()
  })
})
