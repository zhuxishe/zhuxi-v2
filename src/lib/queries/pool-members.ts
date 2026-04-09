import { createClient } from "@/lib/supabase/server"
import type { EnrichedMember } from "@/components/admin/match-detail-types"

export interface PoolMember {
  id: string
  name: string
  memberData: EnrichedMember | null
}

/**
 * 获取某 session 中被取消配对的成员（去重）
 * 返回 { id, name, memberData } 数组，供 RematchPool 使用
 */
export async function fetchPoolMembers(sessionId: string): Promise<PoolMember[]> {
  const supabase = await createClient()

  // 1. 获取被取消的 match_results
  const { data: cancelled, error } = await supabase
    .from("match_results")
    .select("member_a_id, member_b_id")
    .eq("session_id", sessionId)
    .eq("status", "cancelled")

  if (error) throw error
  if (!cancelled || cancelled.length === 0) return []

  // 2. 收集唯一成员 ID
  const ids = new Set<string>()
  for (const row of cancelled) {
    if (row.member_a_id) ids.add(row.member_a_id)
    if (row.member_b_id) ids.add(row.member_b_id)
  }

  // 3. 排除已在其他非取消结果中重新配对的成员
  const { data: active } = await supabase
    .from("match_results")
    .select("member_a_id, member_b_id")
    .eq("session_id", sessionId)
    .neq("status", "cancelled")

  const matched = new Set<string>()
  for (const row of active ?? []) {
    if (row.member_a_id) matched.add(row.member_a_id)
    if (row.member_b_id) matched.add(row.member_b_id)
  }

  const poolIds = [...ids].filter((id) => !matched.has(id))
  if (poolIds.length === 0) return []

  // 4. 获取成员详情（含 popover 所需数据）
  const { data: members, error: mErr } = await supabase
    .from("members")
    .select(`
      id, member_number,
      member_identity (full_name, nickname, school_name, gender, hobby_tags, nationality, degree_level, department),
      member_interests (game_type_pref, scenario_theme_tags, preferred_time_slots, social_goal_primary),
      member_personality (expression_style_tags, group_role_tags, extroversion, warmup_speed),
      member_boundaries (preferred_gender_mix)
    `)
    .in("id", poolIds)

  if (mErr) throw mErr

  return (members ?? []).map((m) => {
    const raw = m.member_identity
    const identity = Array.isArray(raw) ? raw[0] : raw
    const name = (identity as { full_name?: string; nickname?: string } | null)?.full_name
      || (identity as { full_name?: string; nickname?: string } | null)?.nickname
      || "未知"
    return {
      id: m.id,
      name,
      memberData: m as EnrichedMember,
    }
  })
}
