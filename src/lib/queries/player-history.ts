import { createAdminClient } from "@/lib/supabase/admin"

/**
 * 获取玩家已取消的匹配历史（limit 20）
 * 使用 adminClient 绕过 RLS
 */
export async function fetchPlayerMatchHistory(memberId: string) {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from("match_results")
    .select(`
      id, best_slot, rank, created_at, status, group_members,
      cancellation_status,
      session:match_sessions!inner (session_name),
      member_a:members!match_results_member_a_id_fkey (
        id, member_identity (full_name, nickname, hobby_tags),
        member_interests (game_type_pref, scenario_theme_tags),
        member_personality (expression_style_tags, group_role_tags)
      ),
      member_b:members!match_results_member_b_id_fkey (
        id, member_identity (full_name, nickname, hobby_tags),
        member_interests (game_type_pref, scenario_theme_tags),
        member_personality (expression_style_tags, group_role_tags)
      )
    `)
    .eq("status", "cancelled")
    .or(`member_a_id.eq.${memberId},member_b_id.eq.${memberId},group_members.cs.{${memberId}}`)
    .order("created_at", { ascending: false })
    .limit(20)

  if (error) {
    console.error("[fetchPlayerMatchHistory]", error)
    return []
  }

  return data ?? []
}
