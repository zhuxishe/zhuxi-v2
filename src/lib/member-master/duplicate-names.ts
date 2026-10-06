export interface DuplicateNameMember {
  id: string
  fullName: string
  nickname: string | null
  schoolName: string | null
}

export interface DuplicateNameGroup {
  name: string
  members: DuplicateNameMember[]
}

/** Names are review signals only; never use them to merge member identities. */
export function groupDuplicateMemberNames(members: DuplicateNameMember[]): DuplicateNameGroup[] {
  const names = new Map<string, Map<string, DuplicateNameMember>>()
  for (const member of members) {
    const key = member.fullName.normalize("NFKC").replace(/\s+/g, "").toLowerCase()
    if (!key) continue
    const group = names.get(key) ?? new Map<string, DuplicateNameMember>()
    group.set(member.id, member)
    names.set(key, group)
  }
  return [...names.values()]
    .filter((members) => members.size > 1)
    .map((members) => ({ name: [...members.values()][0].fullName.trim(), members: [...members.values()] }))
    .sort((a, b) => b.members.length - a.members.length || a.name.localeCompare(b.name, "zh"))
}
