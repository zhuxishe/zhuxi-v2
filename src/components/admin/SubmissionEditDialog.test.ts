import { isValidElement, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ update: vi.fn(), create: vi.fn(), useState: vi.fn(), transition: vi.fn() }))
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useState: mocks.useState,
  useMemo: (fn: () => unknown) => fn(), useTransition: () => [false, mocks.transition] }))
vi.mock("@/app/admin/matching/rounds/[id]/actions", () => ({
  updateSubmission: mocks.update, createSubmission: mocks.create, deleteSubmission: vi.fn(),
}))
import { SubmissionEditDialog } from "./SubmissionEditDialog"

type Props = { children?: ReactNode; onClick?: () => void; onChange?: (event: { target: { value: string } }) => void; value?: unknown; id?: string }
function find(node: ReactNode, predicate: (props: Props, type: unknown) => boolean): Props | undefined {
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean)
  if (!isValidElement<Props>(node)) return
  return predicate(node.props, node.type) ? node.props : find(node.props.children, predicate)
}
let states: unknown[], cursor: number, pending: Promise<void>
const saved = { id: "answer-1", updated_at: "2026-10-23T00:00:00.123456Z", availability: { "2026-10-23": ["下午"] }, message: "原答卷" }
const onSaved = vi.fn(), onOpenChange = vi.fn()
function render(submission = saved) {
  cursor = 0
  return SubmissionEditDialog({ open: true, onOpenChange, roundId: "round-1", mode: "edit", submission,
    activityStart: "2026-10-23", activityEnd: "2026-10-24", onSaved })
}

describe("admin answer conflict recovery", () => {
  beforeEach(() => {
    vi.resetAllMocks(); states = []
    mocks.useState.mockImplementation((initial: unknown) => {
      const index = cursor++
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial
      return [states[index], (value: unknown) => { states[index] = typeof value === "function" ? value(states[index]) : value }]
    })
    mocks.transition.mockImplementation((work: () => Promise<void>) => { pending = work() })
    mocks.update.mockResolvedValue({ error: "答卷已修改，本页输入保留" })
  })

  it("uses the opened version even if props refresh, and retains edits on conflict", async () => {
    let tree = render()
    find(tree, (_, type) => type === "textarea")!.onChange!({ target: { value: "管理员尚未保存的输入" } })
    find(tree, (props) => props.id === "submission-audit-reason-edit")!.onChange!({ target: { value: "核对答卷填写情况" } })
    tree = render({ ...saved, updated_at: "2026-10-23T00:01:00.654321Z" })
    find(tree, (props) => Boolean(props.onClick) && Array.isArray(props.children) && props.children.includes("保存"))!.onClick!()
    await pending
    expect(mocks.update).toHaveBeenCalledWith("answer-1", expect.objectContaining({ message: "管理员尚未保存的输入" }), "核对答卷填写情况", saved.updated_at)
    expect(onSaved).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
    tree = render()
    expect(find(tree, (_, type) => type === "textarea")?.value).toBe("管理员尚未保存的输入")
    expect(find(tree, (props) => props.children === "答卷已修改，本页输入保留")).toBeDefined()
  })

  it("closes and refreshes only after a successful versioned save", async () => {
    mocks.update.mockResolvedValue({ success: true })
    find(render(), (props) => props.id === "submission-audit-reason-edit")!.onChange!({ target: { value: "核对答卷填写情况" } })
    find(render(), (props) => Boolean(props.onClick) && Array.isArray(props.children) && props.children.includes("保存"))!.onClick!()
    await pending
    expect(onSaved).toHaveBeenCalledOnce()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
