import { createClient } from "@/lib/supabase/server"
import { fetchCancelledPoolIds } from "./cancelled-pool"
import { getSingleRelation } from "@/lib/supabase/relations"
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
  const poolIds = await fetchCancelledPoolIds(sessionId)
  if (poolIds.length === 0) return []

  // 获取成员详情（含 popover 所需数据）
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
    const identity = getSingleRelation(
      m.member_identity as { full_name?: string; nickname?: string } | { full_name?: string; nickname?: string }[] | null
    )
    const name = identity?.full_name || identity?.nickname || "未知"
    return {
      id: m.id,
      name,
      memberData: m as EnrichedMember,
    }
  })
}
