import { createElement, isValidElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ locale: vi.fn(), replace: vi.fn(), refresh: vi.fn() }))
vi.mock("next-intl", () => ({ useLocale: mocks.locale }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }))
vi.mock("next/link", () => ({ default: ({ children, prefetch: _prefetch, ...props }: Record<string, unknown>) => createElement("a", props, children as ReactNode) }))
vi.mock("@/components/ui/button", () => ({ Button: ({ children, variant: _variant, ...props }: Record<string, unknown>) => createElement("button", props, children as ReactNode) }))
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? createElement("div", { role: "dialog" }, children) : null,
  DialogContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  DialogDescription: ({ children }: { children: ReactNode }) => createElement("p", null, children),
  DialogHeader: ({ children }: { children: ReactNode }) => createElement("header", null, children),
  DialogFooter: ({ children }: { children: ReactNode }) => createElement("footer", null, children),
  DialogTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
}))
import { RegistrationReviewDialog } from "./RegistrationReviewDialog"
import { RegistrationReviewGate } from "./RegistrationReviewGate"
import type { RegistrationReviewBlocker } from "@/lib/registration-review-gate/types"

const roundId = "429eea31-9986-42a8-b2b9-67f792e07173"
const previousId = "b0b34817-bc52-432a-a314-f77c965149ae"
const matchId = "e535d1ce-e2e2-4237-aa22-850e1ff2804c"
const blockers: RegistrationReviewBlocker[] = [
  { round_id: previousId, round_name: "活动 A", purpose: "matching", ended_at: "2026-11-17T15:00:00Z", review_href: `/app/reviews/new/${matchId}` },
  { round_id: matchId, round_name: "活动 B", purpose: "registration", ended_at: "2026-11-14T09:00:00Z", review_href: `/app/matches/rounds/${matchId}/reviews` },
]
const base = { open: true, roundId, fromParticipation: true, blockers, onCancel: vi.fn(), onRetry: vi.fn() }

describe("outstanding activity review dialog", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.locale.mockReturnValue("zh") })
  it("renders each activity with its own review destination and the exact original signup", () => {
    const html = renderToStaticMarkup(createElement(RegistrationReviewDialog, base))
    expect(html).toContain("活动 A"); expect(html).toContain("活动 B")
    expect(html).toContain("无需等待对方评分")
    expect(html).toContain(`/app/reviews/new/${matchId}?returnRound=${roundId}&amp;from=participation`)
    expect(html).toContain(`/app/matches/rounds/${matchId}/reviews?returnRound=${roundId}&amp;from=participation`)
    expect(html).toContain("2026/11/18 00:00")
  })
  it("uses Japanese copy and hides obligation links when the check is unknown", () => {
    mocks.locale.mockReturnValue("ja")
    const html = renderToStaticMarkup(createElement(RegistrationReviewDialog, { ...base, failed: true, blockers: [] }))
    expect(html).toContain("評価の完了状況を確認できませんでした")
    expect(html).toContain("再試行")
    expect(html).not.toContain("href=")
  })
  it("direct URL cancellation returns to the supplied owned record and retry refreshes without registering", () => {
    const backHref = `/app/matches/rounds/${roundId}`
    const tree = RegistrationReviewGate({ roundId, fromParticipation: true, backHref, blockers })
    const dialog = (tree.props.children as ReactNode[]).find((node) => isValidElement(node) && node.type === RegistrationReviewDialog)
    if (!isValidElement<Parameters<typeof RegistrationReviewDialog>[0]>(dialog)) throw new Error("Missing review dialog")
    dialog.props.onCancel()
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(backHref)
    dialog.props.onRetry()
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })
})
