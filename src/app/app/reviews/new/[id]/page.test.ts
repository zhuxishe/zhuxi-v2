import { isValidElement, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ match: vi.fn(), reviewed: vi.fn(), redirect: vi.fn((href: string) => { throw new Error(`redirect:${href}`) }) }))
vi.mock("@/lib/auth/player", () => ({ requirePlayer: async () => ({ memberId: "self" }) }))
vi.mock("next-intl/server", () => ({ getLocale: async () => "zh", getTranslations: async () => (key: string) => key }))
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: () => { throw new Error("not-found") } }))
vi.mock("@/lib/queries/matching", () => ({ fetchMatchDetail: mocks.match }))
vi.mock("@/lib/queries/reviews", () => ({ checkReviewExists: mocks.reviewed }))
vi.mock("@/components/player/MutualReviewForm", () => ({ MutualReviewForm: () => null }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => {
  const chain = { select: () => chain, eq: () => chain,
    in: async () => ({ data: [{ id: "partner", member_identity: { full_name: "小竹" } }] }),
    maybeSingle: async () => ({ data: table === "mutual_reviews" ? null : {} }),
  }
  return chain
} }) }))
import NewReviewPage from "./page"
import { MutualReviewForm } from "@/components/player/MutualReviewForm"
import { GroupReviewSelector } from "@/components/player/GroupReviewSelector"
import { ReviewRegistrationReturn } from "@/components/player/ReviewRegistrationReturn"

function find<P>(node: ReactNode, type: unknown): P | undefined {
  if (Array.isArray(node)) return node.map((item) => find<P>(item, type)).find(Boolean)
  if (!isValidElement<{ children?: ReactNode }>(node)) return
  return node.type === type ? node.props as P : find<P>(node.props.children, type)
}
const target = "30000000-0000-0000-0000-000000000002"
const params = Promise.resolve({ id: "match" })
describe("matching review registration return", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.match.mockResolvedValue({ status: "confirmed", member_a_id: "self", member_b_id: "partner", group_members: null, publication_version: 1 })
    mocks.reviewed.mockResolvedValue(false)
  })

  it("passes the validated original registration through the duo form without submitting registration", async () => {
    const tree = await NewReviewPage({ params, searchParams: Promise.resolve({ returnRound: target, from: "participation" }) })
    expect(find<Parameters<typeof MutualReviewForm>[0]>(tree, MutualReviewForm)?.registrationReturn)
      .toEqual({ roundId: target, fromParticipation: true })
    expect(find<Parameters<typeof ReviewRegistrationReturn>[0]>(tree, ReviewRegistrationReturn)?.completed).toBe(false)
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it("returns an already scored duo to the original registration for a fresh all-activity check", async () => {
    mocks.reviewed.mockResolvedValue(true)
    await expect(NewReviewPage({ params, searchParams: Promise.resolve({ returnRound: target }) }))
      .rejects.toThrow(`redirect:/app/matching/survey?round=${target}`)
  })

  it("keeps the registration target through the group member selector", async () => {
    mocks.match.mockResolvedValue({ status: "confirmed", group_members: ["self", "partner"], publication_version: 1 })
    const tree = await NewReviewPage({ params, searchParams: Promise.resolve({ returnRound: target }) })
    expect(find<Parameters<typeof GroupReviewSelector>[0]>(tree, GroupReviewSelector)?.registrationReturn)
      .toEqual({ roundId: target, fromParticipation: false })
  })

  it("ignores an external or duplicate return target", async () => {
    for (const returnRound of ["https://example.test", [target, target]]) {
      const tree = await NewReviewPage({ params, searchParams: Promise.resolve({ returnRound }) })
      expect(find<Parameters<typeof MutualReviewForm>[0]>(tree, MutualReviewForm)?.registrationReturn).toBeNull()
    }
  })
})
