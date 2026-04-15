import { createAdminClient } from "@/lib/supabase/admin"
import { getSingleRelation } from "@/lib/supabase/relations"

/**
 * 批量获取成员名字（adminClient 绕过 RLS）
 * 返回 { id, name }[]，name 优先取 full_name，其次 nickname
 */
export async function fetchGroupMemberNames(
  memberIds: string[]
): Promise<{ id: string; name: string }[]> {
  if (memberIds.length === 0) return []

  const supabase = createAdminClient()
  const { data } = await supabase
    .from("members")
    .select("id, member_identity (full_name, nickname)")
    .in("id", memberIds)

  return (data ?? []).map((m) => {
    const info = getSingleRelation(m.member_identity as Record<string, string> | Record<string, string>[] | null)
    return {
      id: m.id,
      name: info?.full_name ?? info?.nickname ?? "未知",
    }
  })
}
