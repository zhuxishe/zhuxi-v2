type MemberSlots = {
  member_a_id?: string | null
  member_b_id?: string | null
  group_members?: string[] | null
}

export type MatchMemberResult = MemberSlots & { id: string; status: string }

export function getMatchMemberIds(row: MemberSlots): string[] {
  // A group's first member also occupies member_a_id; count them only once.
  return [...new Set([row.member_a_id, row.member_b_id, ...(row.group_members ?? [])]
    .filter((id): id is string => Boolean(id)))]
}

export function findMemberConflicts<T extends MatchMemberResult>(rows: T[]): Map<string, T[]> {
  const byMember = new Map<string, Map<string, T>>()
  for (const row of rows) {
    if (row.status === "cancelled") continue
    for (const memberId of getMatchMemberIds(row)) {
      const matches = byMember.get(memberId) ?? new Map<string, T>()
      matches.set(row.id, row)
      byMember.set(memberId, matches)
    }
  }
  return new Map([...byMember]
    .filter(([, matches]) => matches.size > 1)
    .map(([memberId, matches]) => [memberId, [...matches.values()]]))
}
