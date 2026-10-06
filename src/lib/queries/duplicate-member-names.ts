import { requireAdmin } from "@/lib/auth/admin"
import { createAdminClient } from "@/lib/supabase/admin"
import { getSingleRelation } from "@/lib/supabase/relations"
import { groupDuplicateMemberNames, type DuplicateNameGroup, type DuplicateNameMember } from "@/lib/member-master/duplicate-names"

interface NameRow {
  id: string
  member_identity: { full_name: string; nickname: string | null; school_name: string | null } | null
}

/** Independent of directory filters. null means the scan failed, not no duplicates. */
export async function fetchDuplicateMemberNames(): Promise<DuplicateNameGroup[] | null> {
  await requireAdmin()
  try {
    const client = createAdminClient()
    const members: DuplicateNameMember[] = []
    let afterId: string | null = null
    while (true) {
      let query = client.from("members")
        .select("id,member_identity!inner(full_name,nickname,school_name)")
        .eq("record_scope", "current")
        .neq("account_status", "unbound")
        .is("anonymized_at", null)
        .order("id", { ascending: true })
        .limit(500)
      if (afterId) query = query.gt("id", afterId)
      const { data, error } = await query.returns<NameRow[]>()
      if (error || !data) throw new Error("Member name lookup failed")
      if (data.length === 0) break
      for (const row of data) {
        const identity = getSingleRelation(row.member_identity)
        if (identity?.full_name.trim()) {
          members.push({ id: row.id, fullName: identity.full_name, nickname: identity.nickname, schoolName: identity.school_name })
        }
      }
      // Read until an empty batch, including when the API caps batches below 500.
      const nextId = data[data.length - 1].id
      if (nextId === afterId) throw new Error("Member name lookup did not advance")
      afterId = nextId
    }
    return groupDuplicateMemberNames(members)
  } catch {
    console.error("[fetchDuplicateMemberNames] Unable to complete member name scan")
    return null
  }
}
