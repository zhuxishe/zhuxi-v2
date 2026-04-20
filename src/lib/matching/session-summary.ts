type SessionResultRow = {
  status: string
  member_a_id?: string | null
  member_b_id?: string | null
  group_members?: string[] | null
}

export function countActiveMatchedMembers(rows: SessionResultRow[]): number {
  const active = new Set<string>()
  for (const row of rows) {
    if (row.status === "cancelled") continue
    if (row.member_a_id) active.add(row.member_a_id)
    if (row.member_b_id) active.add(row.member_b_id)
    for (const memberId of row.group_members ?? []) active.add(memberId)
  }
  return active.size
}

export function buildSessionSummary(totalCandidates: number, rows: SessionResultRow[]) {
  const totalMatched = countActiveMatchedMembers(rows)
  return {
    totalMatched,
    totalUnmatched: Math.max(totalCandidates - totalMatched, 0),
  }
}
