import { createClient } from "@supabase/supabase-js"
import { beforeEach, describe, expect, it } from "vitest"
import { withPublishedMultiGroupNumbers } from "./published-group-numbers"
import { publishedMultiGroupTitle } from "./publication-display"

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const sessionId = id(90000), session = { id: sessionId, status: "confirmed", publication_version: 4 }
interface Row { id: string; session_id: string; rank: number | null; status: string; publication_version: number; session: typeof session; multi: boolean; other_private_profile?: string }
const group = (n: number, rank: number | null, status = "confirmed"): Row => ({ id: id(n), session_id: sessionId, rank, status, publication_version: 4, session, multi: true })
let metadata: Row[]
let requests: URL[]
let available: boolean
let withCount: boolean
let truncate: boolean
function client() {
  return createClient("https://group-numbers.invalid", "fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input) => {
      const url = new URL(String(input)); requests.push(url)
      if (!available) return Response.json({ message: "unavailable" }, { status: 503 })
      const p = url.searchParams, offset = Number(p.get("offset") ?? 0), limit = Number(p.get("limit") ?? 1000)
      const rows = metadata.filter((row) => row.multi && ["confirmed", "cancelled"].includes(row.status)
        && p.get("session_id")?.includes(row.session_id) && p.get("or")?.includes(`publication_version.eq.${row.publication_version}`))
        .sort((a, b) => a.id.localeCompare(b.id))
      const page = rows.slice(offset, offset + (truncate ? 1 : limit)).map(({ multi: _multi, ...row }) => row)
      return Response.json(page, { headers: withCount ? { "content-range": `${offset}-${Math.max(offset, offset + page.length - 1)}/${rows.length}` } : {} })
    } },
  })
}
const owned = (n: number) => ({ id: id(n), group_members: ["self", "partner"], publication_version: 4, session })
beforeEach(() => { metadata = []; requests = []; available = true; withCount = true; truncate = false })

describe("published multi group ordinals", () => {
  it("numbers the player's M02 from the full multi-only batch rather than their own rows, size or sparse global rank", async () => {
    metadata = [group(1, 10), group(2, 42), { ...group(3, 2), multi: false }, { ...group(4, 3), multi: false }, group(5, 99)]
    const result = await withPublishedMultiGroupNumbers([owned(2)], client())
    expect(result[0].group_number).toBe(2)
    expect(publishedMultiGroupTitle(result[0].group_number)).toBe("多人组02")
    expect(requests).toHaveLength(1)
    expect(requests[0].searchParams.get("group_members")).toBe("not.is.null")
    expect(requests[0].searchParams.get("session_id")).toBe(`in.(${sessionId})`)
    expect(requests[0].searchParams.get("select")).not.toMatch(/member_a|member_b|group_members|identity|profile/)
    expect(result[0]).not.toHaveProperty("session_id")
  })
  it("uses rank then result ID ties, independent of response order and the order of owned rows", async () => {
    metadata = [group(8, 7), group(3, 1), group(2, 1), group(9, null)]
    const result = await withPublishedMultiGroupNumbers([owned(8), owned(2), owned(3), owned(9)], client())
    expect(result.map((row) => row.group_number)).toEqual([4, 2, 3, 1])
  })
  it("keeps cancelled groups in their publication's numbering while ignoring old versions and drafts", async () => {
    metadata = [group(1, 1, "cancelled"), group(2, 4), { ...group(3, 0), publication_version: 3 }, group(4, 0, "draft")]
    expect((await withPublishedMultiGroupNumbers([owned(2)], client()))[0].group_number).toBe(2)
  })
  it("retains older cancelled history without manufacturing an ordinal from the current version", async () => {
    const historical = { ...owned(3), publication_version: 3, status: "cancelled" }
    const result = await withPublishedMultiGroupNumbers([historical], client())
    expect(result).toEqual([historical]); expect(requests).toEqual([])
    expect(publishedMultiGroupTitle(result[0].group_number)).toBe("多人组")
  })
  it("never applies a current label to an older copy of the same result ID", async () => {
    metadata = [group(1, 1), group(2, 2)]
    const result = await withPublishedMultiGroupNumbers([owned(2), { ...owned(2), publication_version: 3 }], client())
    expect(result[0].group_number).toBe(2)
    expect(result[1].group_number).toBeUndefined()
  })
  it("does not read groups for duos, withdrawn sessions or malformed batch identities", async () => {
    const values = [{ ...owned(1), group_members: null }, { ...owned(2), session: { ...session, status: "draft" } }, { ...owned(3), session: { ...session, id: "invalid" } }]
    expect(await withPublishedMultiGroupNumbers(values, client())).toEqual(values)
    expect(requests).toEqual([])
  })
  it("does not expose metadata or source profiles of other groups", async () => {
    metadata = [{ ...group(1, 1), other_private_profile: "OTHER-PRIVATE-PROFILE" }, group(2, 2)]
    const result = await withPublishedMultiGroupNumbers([owned(2)], client())
    expect(result).toEqual([{ ...owned(2), group_number: 2 }])
    expect(JSON.stringify(result)).not.toContain("OTHER-PRIVATE")
    expect(JSON.stringify(result)).not.toContain(id(1))
  })
  it.each(["failure", "count", "truncated", "stale"])("falls back without a misleading number for %s", async (kind) => {
    metadata = [group(1, 1), group(2, 2), group(3, 3)]
    if (kind === "failure") available = false
    if (kind === "count") withCount = false
    if (kind === "truncated") truncate = true
    if (kind === "stale") metadata[0] = { ...metadata[0], session: { ...session, publication_version: 5 } }
    const result = await withPublishedMultiGroupNumbers([{ ...owned(2), group_number: 999 }], client())
    expect(result[0].group_number).toBeUndefined()
    expect(publishedMultiGroupTitle(result[0].group_number)).toBe("多人组")
  })
  it("reads a second bounded page instead of assuming the default API page is complete", async () => {
    metadata = Array.from({ length: 1001 }, (_, i) => group(i + 1, i + 1))
    const result = await withPublishedMultiGroupNumbers([owned(1001)], client())
    expect(result[0].group_number).toBe(1001)
    expect(requests).toHaveLength(2)
    expect(requests[1].searchParams.get("offset")).toBe("1000")
  })
})
