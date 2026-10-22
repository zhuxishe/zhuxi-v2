import { describe, expect, it } from "vitest"
import { resolveMatchingPublicationNotification } from "./notifications"

const member = "my-member"
const session = { id: "session", status: "confirmed", publication_version: 2 }
const result = { id: "result", session_id: "session", status: "confirmed", publication_version: 2,
  member_a_id: member, member_b_id: "partner", group_members: null as string[] | null }
const notice = { notification_type: "matching_published", round_id: "round", match_session_id: "session", match_result_id: "result", publication_version: 2 }

describe("matching publication notice targets", () => {
  it("opens an owned result only for its currently published version", () => {
    expect(resolveMatchingPublicationNotification(notice, member, new Map([[session.id, session]]), new Map([[result.id, result]])))
      .toEqual({ href: "/app/matches/result", unavailable: false })
  })
  it("allows owned group membership without granting another member's result", () => {
    const group = { ...result, member_a_id: "other", member_b_id: "other", group_members: [member, "other"] }
    expect(resolveMatchingPublicationNotification(notice, member, new Map([[session.id, session]]), new Map([[result.id, group]]))).toMatchObject({ unavailable: false })
    expect(resolveMatchingPublicationNotification(notice, "outsider", new Map([[session.id, session]]), new Map([[result.id, group]])))
      .toMatchObject({ href: "/app/matches#matching", unavailable: true })
  })
  it.each([
    ["withdrawn", { ...session, status: "draft" }, result, notice],
    ["replaced notice version", session, result, { ...notice, publication_version: 1 }],
    ["obsolete result", session, { ...result, publication_version: 1 }, notice],
    ["unpublished result", session, { ...result, status: "draft" }, notice],
    ["another session's result", session, { ...result, session_id: "other" }, notice],
  ])("takes a %s notice to safe status rather than its old detail", (_name, s, r, n) => {
    expect(resolveMatchingPublicationNotification(n, member, new Map([[s.id, s]]), new Map([[r.id, r]])))
      .toEqual({ href: "/app/matches#matching", unavailable: true, state: "stale" })
  })
  it("identifies a cancelled old publication and allows only the separate cancellation notice to open history", () => {
    const cancelled = { ...result, status: "cancelled" }
    expect(resolveMatchingPublicationNotification(notice, member, new Map([[session.id, session]]), new Map([[result.id, cancelled]])))
      .toEqual({ href: "/app/matches#matching", unavailable: true, state: "cancelled" })
    expect(resolveMatchingPublicationNotification({ ...notice, notification_type: "matching_cancelled" }, member, new Map([[session.id, session]]), new Map([[result.id, cancelled]])))
      .toEqual({ href: "/app/matches/result", unavailable: false })
  })
  it("sends unmatched and withdrawal notifications to matching status without revealing a draft", () => {
    expect(resolveMatchingPublicationNotification({ ...notice, notification_type: "matching_unmatched", match_result_id: null }, member, new Map([[session.id, session]]), new Map()))
      .toEqual({ href: "/app/matches#matching", unavailable: false })
    expect(resolveMatchingPublicationNotification({ ...notice, notification_type: "matching_withdrawn" }, member, new Map(), new Map()))
      .toEqual({ href: "/app/matches#matching", unavailable: false })
  })
  it("keeps a deleted draft's withdrawal notice useful while making its former publication unavailable", () => {
    const retainedNotice = { ...notice, match_session_id: null, match_result_id: null }
    expect(resolveMatchingPublicationNotification({ ...retainedNotice, notification_type: "matching_withdrawn" }, member, new Map(), new Map()))
      .toEqual({ href: "/app/matches#matching", unavailable: false })
    expect(resolveMatchingPublicationNotification(retainedNotice, member, new Map(), new Map()))
      .toEqual({ href: "/app/matches#matching", unavailable: true, state: "stale" })
  })
})
