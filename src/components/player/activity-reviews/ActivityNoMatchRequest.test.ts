import { isValidElement, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ state: vi.fn(), ref: vi.fn(), action: vi.fn() }))
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useState: mocks.state, useRef: mocks.ref }))
vi.mock("@/app/app/matches/rounds/[roundId]/reviews/actions", () => ({ submitActivityNoMatchRequestAction: mocks.action }))
import { ActivityNoMatchRequest } from "./ActivityNoMatchRequest"

type Props = { children?: ReactNode; type?: string; checked?: boolean; value?: string; disabled?: boolean; role?: string; onChange?: (event: { target: { value?: string; checked?: boolean } }) => void; onClick?: () => Promise<void> }
function find(node: ReactNode, predicate: (props: Props) => boolean): Props | undefined {
  if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean)
  if (!isValidElement<Props>(node)) return
  return predicate(node.props) ? node.props : find(node.props.children, predicate)
}
let states: unknown[], refs: { current: unknown }[], cursor: number, refCursor: number
const saved = vi.fn()
const request = { id: "request", targetMemberId: "partner", reason: "", status: "pending" as const, version: 1, createdAt: "2026-11-24T00:00:00Z", updatedAt: "2026-11-24T00:00:00Z" }
function render(extra: Partial<Parameters<typeof ActivityNoMatchRequest>[0]> = {}) {
  cursor = 0; refCursor = 0
  return ActivityNoMatchRequest({ roundId: "round", targetMemberId: "partner", targetName: "小竹", locale: "zh", canRequest: true, onSaved: saved, ...extra })
}
function submit(tree = render()) { return find(tree, p => p.children === "提交不再匹配申请")?.onClick?.() }
beforeEach(() => {
  vi.clearAllMocks(); states = []; refs = []
  mocks.state.mockImplementation((initial: unknown) => { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], (value: unknown) => { states[i] = value }] })
  mocks.ref.mockImplementation((initial: unknown) => { const i = refCursor++; return refs[i] ?? (refs[i] = { current: initial }) })
  mocks.action.mockResolvedValue({ success: true, request })
})
describe("independent player no-match request", () => {
  it("requires interaction confirmation and submits no fabricated rating or report", async () => {
    await submit()
    expect(mocks.action).not.toHaveBeenCalled()
    find(render(), p => p.type === "checkbox")?.onChange?.({ target: { checked: true } })
    await submit()
    expect(mocks.action).toHaveBeenCalledOnce()
    expect(mocks.action.mock.calls[0][0]).toMatchObject({ roundId: "round", targetMemberId: "partner", reason: "", interactionConfirmed: true })
    expect(mocks.action.mock.calls[0][0]).not.toHaveProperty("review")
    expect(mocks.action.mock.calls[0][0]).not.toHaveProperty("report")
    expect(saved).toHaveBeenCalledWith(request)
  })
  it("preserves the request ID on retry and never resubmits an existing application", async () => {
    find(render(), p => p.type === "checkbox")?.onChange?.({ target: { checked: true } })
    mocks.action.mockResolvedValueOnce({ error: "PEER_SAVE_FAILED" })
    await submit(); await submit()
    expect(mocks.action.mock.calls[0][0].requestId).toBe(mocks.action.mock.calls[1][0].requestId)
    expect(find(render({ existing: request }), p => p.children === "提交不再匹配申请")).toBeUndefined()
    expect(find(render({ existing: request }), p => p.children === "待核查")).toBeDefined()
  })
})
