import { createClient } from "@/lib/supabase/server"
import { validateUuids } from "@/lib/sanitize"

export interface PairRelation {
  relationId: string
  partnerId: string
  status: string
  pairCount: number
  lastMatchedAt: string | null
  avgScore: number | null
}

export async function fetchPairRelationships(
  memberIds: string[]
): Promise<Map<string, PairRelation[]>> {
  const result = new Map<string, PairRelation[]>()
  if (memberIds.length === 0) return result

  validateUuids(memberIds)
  const supabase = await createClient()

  const batchSize = 50
  let allData: {
    id: string
    member_a_id: string
    member_b_id: string
    status: string
    pair_count: number
    last_matched_at: string | null
    avg_score: number | null
  }[] = []

  for (let i = 0; i < memberIds.length; i += batchSize) {
    const batch = memberIds.slice(i, i + batchSize)
    const idList = batch.join(",")
    const { data, error } = await supabase
      .from("pair_relationships")
      .select("id, member_a_id, member_b_id, status, pair_count, last_matched_at, avg_score")
      .or(`member_a_id.in.(${idList}),member_b_id.in.(${idList})`)

    if (error) throw error
    if (data) allData = allData.concat(data)
  }

  const seen = new Set<string>()
  const unique = allData.filter((row) => {
    if (seen.has(row.id)) return false
    seen.add(row.id)
    return true
  })

  for (const row of unique) {
    const a = row.member_a_id
    const b = row.member_b_id
    const rel: Omit<PairRelation, "partnerId"> = {
      relationId: row.id,
      status: row.status,
      pairCount: row.pair_count,
      lastMatchedAt: row.last_matched_at,
      avgScore: row.avg_score,
    }

    if (!result.has(a)) result.set(a, [])
    result.get(a)!.push({ ...rel, partnerId: b })

    if (!result.has(b)) result.set(b, [])
    result.get(b)!.push({ ...rel, partnerId: a })
  }

  return result
}
