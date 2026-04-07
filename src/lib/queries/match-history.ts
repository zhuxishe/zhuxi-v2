import { createClient } from "@/lib/supabase/server"

/** Fetch past match history for given candidates (for repeat penalty) */
export async function fetchMatchHistory(memberIds: string[]) {
  if (memberIds.length === 0) return new Map<string, { name: string; count: number }[]>()

  const supabase = await createClient()

  // Filter by candidate IDs — batch if >50 to avoid URL length limits
  const batchSize = 50
  let allData: { member_a_id: string; member_b_id: string | null }[] = []

  for (let i = 0; i < memberIds.length; i += batchSize) {
    const batch = memberIds.slice(i, i + batchSize)
    const idList = batch.join(",")
    const { data, error } = await supabase
      .from("match_results")
      .select("member_a_id, member_b_id")
      .or(`member_a_id.in.(${idList}),member_b_id.in.(${idList})`)

    if (error) throw error
    if (data) allData = allData.concat(data)
  }

  // Deduplicate (batches may overlap)
  const seen = new Set<string>()
  const data = allData.filter((row) => {
    const key = `${row.member_a_id}-${row.member_b_id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Build history map: memberId → [{name: partnerId, count}]
  const historyMap = new Map<string, Map<string, number>>()
  for (const row of data ?? []) {
    const a = row.member_a_id as string
    const b = row.member_b_id as string
    if (!historyMap.has(a)) historyMap.set(a, new Map())
    if (!historyMap.has(b)) historyMap.set(b, new Map())
    historyMap.get(a)!.set(b, (historyMap.get(a)!.get(b) ?? 0) + 1)
    historyMap.get(b)!.set(a, (historyMap.get(b)!.get(a) ?? 0) + 1)
  }

  const result = new Map<string, { name: string; count: number }[]>()
  for (const [mid, partners] of historyMap) {
    result.set(mid, Array.from(partners, ([name, count]) => ({ name, count })))
  }
  return result
}
