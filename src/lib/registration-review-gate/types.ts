export interface RegistrationReviewBlocker {
  round_id: string
  round_name: string
  purpose: "matching" | "registration"
  ended_at: string
  review_href: string
}

export interface RegistrationReviewGate {
  blockers: RegistrationReviewBlocker[]
}

export const REVIEW_GATE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Only the two existing review pages are valid destinations, without query strings. */
export function isRegistrationReviewHref(href: string, purpose: RegistrationReviewBlocker["purpose"], roundId: string) {
  if (purpose === "registration") return href === `/app/matches/rounds/${roundId}/reviews`
  const match = /^\/app\/reviews\/new\/([^/?#]+)$/.exec(href)
  return Boolean(match && REVIEW_GATE_UUID.test(match[1]))
}

/** A missing or malformed result is unknown, never evidence that registration is allowed. */
export function parseRegistrationReviewGate(value: unknown): RegistrationReviewGate {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid registration review check")
  const blockers = (value as Record<string, unknown>).blockers
  if (!Array.isArray(blockers)) throw new Error("Invalid registration review check")
  const seen = new Set<string>()
  return { blockers: blockers.map((value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid registration review activity")
    const row = value as Record<string, unknown>
    if (typeof row.round_id !== "string" || !REVIEW_GATE_UUID.test(row.round_id) || seen.has(row.round_id)
      || typeof row.round_name !== "string" || !row.round_name.trim()
      || (row.purpose !== "matching" && row.purpose !== "registration")
      || typeof row.ended_at !== "string" || !Number.isFinite(Date.parse(row.ended_at))
      || typeof row.review_href !== "string" || !isRegistrationReviewHref(row.review_href, row.purpose, row.round_id)) {
      throw new Error("Invalid registration review activity")
    }
    seen.add(row.round_id)
    return { round_id: row.round_id, round_name: row.round_name, purpose: row.purpose,
      ended_at: row.ended_at, review_href: row.review_href }
  }) }
}
