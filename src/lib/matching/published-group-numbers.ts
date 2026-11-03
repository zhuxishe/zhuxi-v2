import type { createAdminClient } from "@/lib/supabase/admin"
import { validateUuids } from "@/lib/sanitize"

interface OwnedResult {
  id: string
  group_members?: unknown
  publication_version?: unknown
  session: unknown
}
interface Metadata {
  id: string
  session_id: string
  rank: number | null
  status: string
  publication_version: number
  session: unknown
}

const PAGE_SIZE = 1000
const MAX_GROUPS = 10000
const relation = (value: unknown): Record<string, unknown> | null => {
  const item = Array.isArray(value) ? value.length === 1 ? value[0] : null : value
  return item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : null
}
const versionOf = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null

/**
 * Enrich only results whose ownership/publication/test-domain checks already
 * passed. Group numbering uses every multiplayer result in that same published
 * batch, including subsequent cancellations, never only this player's rows.
 * Only IDs, ranks and publication metadata are read; other members' identities
 * and profiles never enter the query or leave it in the returned player DTO.
 */
export async function withPublishedMultiGroupNumbers<T extends OwnedResult>(
  owned: T[],
  db: ReturnType<typeof createAdminClient>,
): Promise<Array<T & { group_number?: number }>> {
  const clean = owned.map((row) => {
    const result = { ...row } as T & { group_number?: number }
    delete result.group_number
    return result
  })
  const batches = new Map<string, number>()
  for (const row of clean) {
    if (!Array.isArray(row.group_members) || !row.group_members.length) continue
    const session = relation(row.session), version = versionOf(row.publication_version)
    // Older cancellations remain visible as history, but current mutable result
    // ranks cannot reliably reconstruct their original publication's ordinal.
    if (!version || session?.status !== "confirmed" || session.publication_version !== version || typeof session.id !== "string") continue
    try { validateUuids([session.id]) } catch { continue }
    batches.set(session.id, version)
  }
  if (!batches.size) return clean
  const sessionIds = [...batches.keys()]
  const pairs = [...batches].map(([id, version]) => `and(session_id.eq.${id},publication_version.eq.${version})`).join(",")
  const metadata: Metadata[] = []
  const seen = new Set<string>()
  let expected: number | null = null
  try {
    // This optional display enrichment must not repeatedly delay core results.
    const signal = AbortSignal.timeout(4000)
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, count, error } = await db.from("match_results")
        .select("id,session_id,rank,status,publication_version,session:match_sessions!inner(id,status,publication_version)", { count: "exact" })
        .in("session_id", sessionIds)
        .or(pairs)
        .in("status", ["confirmed", "cancelled"])
        .not("group_members", "is", null)
        .not("group_members", "eq", "{}")
        .eq("session.status", "confirmed")
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1)
        .abortSignal(signal)
        .retry(false)
      if (error || !Array.isArray(data) || !Number.isSafeInteger(count) || count == null || count < 0 || count > MAX_GROUPS) return clean
      if (expected !== null && expected !== count) return clean
      expected = count
      for (const item of data) {
        const row = item as unknown as Metadata, session = relation(row.session)
        if (typeof row.id !== "string" || typeof row.session_id !== "string" || seen.has(row.id)
          || !batches.has(row.session_id) || row.publication_version !== batches.get(row.session_id)
          || session?.id !== row.session_id || session.status !== "confirmed" || session.publication_version !== row.publication_version
          || !["confirmed", "cancelled"].includes(row.status)
          || (row.rank !== null && (typeof row.rank !== "number" || !Number.isFinite(row.rank)))) return clean
        try { validateUuids([row.id]) } catch { return clean }
        seen.add(row.id); metadata.push(row)
      }
      if (metadata.length === expected) break
      // Never interpret a truncated response as the complete group list.
      if (data.length !== PAGE_SIZE || metadata.length > expected) return clean
    }
  } catch { return clean }

  const numbers = new Map<string, number>()
  for (const id of sessionIds) {
    metadata.filter((row) => row.session_id === id)
      .sort((a, b) => (Number(a.rank) || 0) - (Number(b.rank) || 0) || a.id.localeCompare(b.id))
      .forEach((row, index) => numbers.set(row.id, index + 1))
  }
  return clean.map((row) => {
    const number = numbers.get(row.id)
    const session = relation(row.session)
    const current = typeof session?.id === "string" && batches.get(session.id) === row.publication_version
      && session.publication_version === row.publication_version && session.status === "confirmed"
    return current && number && Array.isArray(row.group_members) && row.group_members.length ? { ...row, group_number: number } : row
  })
}
