import { createClient } from "@/lib/supabase/server"
import { validateUuids } from "@/lib/sanitize"

export async function fetchMatchSessions() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("match_sessions")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function fetchMatchSession(id: string) {
  const supabase = await createClient()

  const { data: session, error: sErr } = await supabase
    .from("match_sessions")
    .select("*")
    .eq("id", id)
    .single()

  if (sErr) throw sErr

  const memberSelect = `
    id, member_number,
    member_identity (full_name, nickname, school_name, gender, hobby_tags, nationality, degree_level, department),
    member_interests (game_type_pref, scenario_theme_tags, preferred_time_slots, social_goal_primary),
    member_personality (expression_style_tags, group_role_tags, extroversion, warmup_speed),
    member_boundaries (preferred_gender_mix)
  `

  const { data: results, error: rErr } = await supabase
    .from("match_results")
    .select(`
      *,
      member_a:members!match_results_member_a_id_fkey (${memberSelect}),
      member_b:members!match_results_member_b_id_fkey (${memberSelect})
    `)
    .eq("session_id", id)
    .order("rank", { ascending: true })

  if (rErr) throw rErr

  // Resolve group_members UUIDs to member details for group match display
  const groupMemberIds = new Set<string>()
  for (const r of results ?? []) {
    if (Array.isArray(r.group_members)) {
      for (const id of r.group_members) groupMemberIds.add(id)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groupMemberMap = new Map<string, any>()
  if (groupMemberIds.size > 0) {
    const { data: gmData } = await supabase
      .from("members")
      .select(`
        id, member_number,
        member_identity (full_name, nickname, school_name, gender, hobby_tags, nationality, degree_level, department),
        member_interests (game_type_pref, scenario_theme_tags, preferred_time_slots, social_goal_primary),
        member_personality (expression_style_tags, group_role_tags, extroversion, warmup_speed),
        member_boundaries (preferred_gender_mix)
      `)
      .in("id", [...groupMemberIds])
    for (const m of gmData ?? []) groupMemberMap.set(m.id, m)
  }

  const enrichedResults = (results ?? []).map((r) => ({
    ...r,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    group_member_details: Array.isArray(r.group_members) && r.group_members.length > 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (r.group_members as string[]).map((id) => groupMemberMap.get(id)).filter(Boolean) as any[]
      : null,
  }))

  return { session, results: enrichedResults }
}

export async function fetchMatchCandidates() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("members")
    .select(`
      id, member_number, status, attractiveness_score, membership_type,
      member_identity (*),
      member_interests (*),
      member_personality (*),
      member_language (*),
      member_boundaries (*),
      member_dynamic_stats (activity_count, late_count, no_show_count, replay_willing_rate, reliability_score),
      personality_quiz_results (score_e, score_a, score_o, score_c, score_n)
    `)
    .eq("status", "approved")
    .eq("membership_type", "player")

  if (error) throw error
  return data ?? []
}

// Re-export for backward compatibility
export { fetchMatchHistory } from "./match-history"

export async function fetchPlayerMatches(memberId: string) {
  validateUuids([memberId])
  // 用 admin client 绕过 RLS：玩家需要看到搭档的资料
  // 安全性由 memberId 过滤保证（只查自己参与的匹配）
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from("match_results")
    .select(`
      id, best_slot, rank, created_at, status, cancellation_status,
      group_members,
      session:match_sessions!inner (id, session_name, created_at, status),
      member_a:members!match_results_member_a_id_fkey (
        id,
        member_identity (full_name, nickname, hobby_tags),
        member_interests (game_type_pref, scenario_theme_tags),
        member_personality (expression_style_tags, group_role_tags)
      ),
      member_b:members!match_results_member_b_id_fkey (
        id,
        member_identity (full_name, nickname, hobby_tags),
        member_interests (game_type_pref, scenario_theme_tags),
        member_personality (expression_style_tags, group_role_tags)
      )
    `)
    .eq("status", "confirmed")
    .eq("session.status", "confirmed")
    .or(`member_a_id.eq.${memberId},member_b_id.eq.${memberId},group_members.cs.{${memberId}}`)
    .order("created_at", { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function fetchMatchDetail(matchId: string, memberId: string) {
  // 用 admin client 绕过 RLS：玩家需要看到搭档的资料
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from("match_results")
    .select(`
      id, member_a_id, member_b_id, group_members, best_slot, rank, status,
      created_at,
      cancellation_status, cancellation_reason, cancellation_requested_by,
      cancellation_requested_at,
      session:match_sessions (id, session_name, created_at),
      member_a:members!match_results_member_a_id_fkey (
        id,
        member_identity (full_name, nickname, hobby_tags),
        member_interests (game_type_pref, scenario_theme_tags),
        member_personality (expression_style_tags, group_role_tags)
      ),
      member_b:members!match_results_member_b_id_fkey (
        id,
        member_identity (full_name, nickname, hobby_tags),
        member_interests (game_type_pref, scenario_theme_tags),
        member_personality (expression_style_tags, group_role_tags)
      )
    `)
    .eq("id", matchId)
    .single()

  if (error) return null
  // Verify player is a participant（支持多人组）
  const isParticipant =
    data.member_a_id === memberId ||
    data.member_b_id === memberId ||
    (Array.isArray(data.group_members) && data.group_members.includes(memberId))
  if (!isParticipant) return null
  return data
}

/** Fetch pair relationships for members in a given session's results */
export async function fetchPairRelationships(memberIds: string[]) {
  if (memberIds.length === 0) return []
  validateUuids(memberIds)
  const supabase = await createClient()

  const idList = memberIds.join(",")
  const { data, error } = await supabase
    .from("pair_relationships")
    .select("member_a_id, member_b_id, pair_count, status, avg_score")
    .or(`member_a_id.in.(${idList}),member_b_id.in.(${idList})`)

  if (error) throw error
  return data ?? []
}
