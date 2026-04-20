import { createClient } from "@/lib/supabase/server"
import { validateUuids } from "@/lib/sanitize"

/** Fetch past match history for given candidates (for repeat penalty) */
export async function fetchMatchHistory(memberIds: string[]) {
  if (memberIds.length === 0) return new Map<string, { name: string; count: number }[]>()

  validateUuids(memberIds)
  const supabase = await createClient()

  // Filter by candidate IDs — batch if >50 to avoid URL length limits
  const batchSize = 50
  let allData: {
    id: string
    member_a_id: string
    member_b_id: string | null
    group_members: string[] | null
  }[] = []

  for (let i = 0; i < memberIds.length; i += batchSize) {
    const batch = memberIds.slice(i, i + batchSize)
    const idList = batch.join(",")
    const groupFilters = batch.map((id) => `group_members.cs.{${id}}`).join(",")
    const { data, error } = await supabase
      .from("match_results")
      .select("id, member_a_id, member_b_id, group_members, session:match_sessions!inner(status)")
      .eq("status", "confirmed")
      .eq("session.status", "confirmed")
      .or(`member_a_id.in.(${idList}),member_b_id.in.(${idList}),${groupFilters}`)

    if (error) throw error
    if (data) {
      allData = allData.concat(data.map((row) => ({
        id: row.id,
        member_a_id: row.member_a_id,
        member_b_id: row.member_b_id,
        group_members: Array.isArray(row.group_members) ? row.group_members : null,
      })))
    }
  }

  // Deduplicate (batches may overlap)
  const seen = new Set<string>()
  const data = allData.filter((row) => {
    if (seen.has(row.id)) return false
    seen.add(row.id)
    return true
  })

  // Build history map: memberId → [{name: partnerId, count}]
  const historyMap = new Map<string, Map<string, number>>()
  for (const row of data ?? []) {
    const members = Array.isArray(row.group_members) && row.group_members.length > 0
      ? [...new Set(row.group_members)]
      : row.member_b_id
        ? [row.member_a_id, row.member_b_id]
        : [row.member_a_id]

    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        const a = members[i]
        const b = members[j]
        if (!historyMap.has(a)) historyMap.set(a, new Map())
        if (!historyMap.has(b)) historyMap.set(b, new Map())
        historyMap.get(a)!.set(b, (historyMap.get(a)!.get(b) ?? 0) + 1)
        historyMap.get(b)!.set(a, (historyMap.get(b)!.get(a) ?? 0) + 1)
      }
    }
  }

  const result = new Map<string, { name: string; count: number }[]>()
  for (const [mid, partners] of historyMap) {
    result.set(mid, Array.from(partners, ([name, count]) => ({ name, count })))
  }
  return result
}
