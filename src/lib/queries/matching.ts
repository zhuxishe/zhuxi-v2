import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { createAdminClient } from "@/lib/supabase/admin"
import { validateUuids } from "@/lib/sanitize"
import { filterAccessibleMatchingResults } from "@/lib/matching/test-round-access"
import { getPlayerSharedAvailability, type PlayerSharedAvailability } from "@/lib/matching/player-shared-availability"

export async function fetchMatchSessions() {
  await requireAdmin()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("match_sessions")
    .select("id, session_name, total_candidates, total_matched, created_at, round_id, status, results_ready, publication_version")
    .order("created_at", { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function fetchMatchSession(id: string) {
  await requireAdmin()
  const supabase = createAdminClient()

  const { data: session, error: sErr } = await supabase
    .from("match_sessions")
    .select("*")
    .eq("id", id)
    .single()

  if (sErr) throw sErr

  const memberSelect = `
    id, record_source,
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

   
  const groupMemberMap = new Map<string, any>()
  if (groupMemberIds.size > 0) {
    const { data: gmData } = await supabase
      .from("members")
      .select(`
        id, record_source,
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
     
    group_member_details: Array.isArray(r.group_members) && r.group_members.length > 0
       
      ? (r.group_members as string[]).map((id) => groupMemberMap.get(id)).filter(Boolean) as any[]
      : null,
  }))

  return { session, results: enrichedResults }
}

export async function fetchMatchCandidates() {
  await requireAdmin()
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from("members")
    .select(`
      id, status, attractiveness_score, membership_type,
      member_identity (
        full_name, nickname, gender, current_city, school_name, department,
        degree_level, hobby_tags, personality_self_tags, taboo_tags
      ),
      member_interests (
        game_type_pref, scenario_mode_pref, scenario_theme_tags,
        preferred_time_slots, social_goal_primary, accept_beginners,
        accept_cross_school, activity_area
      ),
      member_personality (
        expression_style_tags, group_role_tags, extroversion, warmup_speed
      ),
      member_language (communication_language_pref, japanese_level),
      member_boundaries (preferred_gender_mix, taboo_tags, deal_breakers),
      member_dynamic_stats (activity_count, late_count, no_show_count, replay_willing_rate, reliability_score)
    `)
    .eq("record_scope", "current")
    .eq("is_test", false)
    .eq("account_status", "active")
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
      id, best_slot, rank, created_at, status, cancellation_status, publication_version,
      group_members,
      session:match_sessions!inner (id, session_name, created_at, status, publication_version, published_at, round:match_rounds(id, round_name, is_test)),
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
    .gt("publication_version", 0)
    .eq("session.status", "confirmed")
    .or(`member_a_id.eq.${memberId},member_b_id.eq.${memberId},group_members.cs.{${memberId}}`)
    .order("created_at", { ascending: false })

  if (error) throw error
  return filterAccessibleMatchingResults((data ?? []).filter(isCurrentPublishedMatch))
}

export async function fetchMatchDetail(matchId: string, memberId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(matchId)) return null
  validateUuids([matchId, memberId])
  // 用 admin client 绕过 RLS：玩家需要看到搭档的资料
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from("match_results")
    .select(`
      id, member_a_id, member_b_id, group_members, best_slot, rank, status,
      created_at, publication_version,
      cancellation_status, cancellation_reason, cancellation_requested_by,
      cancellation_requested_at,
      session:match_sessions!inner (id, session_name, created_at, status, publication_version, published_at, round:match_rounds(id, round_name, is_test)),
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
    .in("status", ["confirmed", "cancelled"])
    .gt("publication_version", 0)
    .eq("session.status", "confirmed")
    .or(`member_a_id.eq.${memberId},member_b_id.eq.${memberId},group_members.cs.{${memberId}}`)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  if (!isCurrentPublishedMatch(data)) return null
  // Verify player is a participant（支持多人组）
  const isParticipant =
    data.member_a_id === memberId ||
    data.member_b_id === memberId ||
    (Array.isArray(data.group_members) && data.group_members.includes(memberId))
  if (!isParticipant) return null
  if (!(await filterAccessibleMatchingResults([data])).length) return null
  const shared = await fetchVisibleDuoSharedAvailability(supabase, data, memberId)
  if (!shared.stillVisible) return null
  return { ...data, sharedAvailability: shared.availability }
}

function relationObject(value: unknown): Record<string, unknown> | null {
  const item = Array.isArray(value) ? value.length === 1 ? value[0] : null : value
  return item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : null
}

/**
 * Read both answers in one statement anchored to the already authorized result.
 * A concurrent withdrawal, cancellation or replacement cannot expose a former
 * partner's current schedule. Only the intersection leaves this server query.
 */
async function fetchVisibleDuoSharedAvailability(
  supabase: ReturnType<typeof createAdminClient>,
  match: { id: string; member_a_id: string; member_b_id: string | null; group_members: string[] | null; status: string; publication_version: number; session: unknown },
  memberId: string,
): Promise<{ stillVisible: boolean; availability: PlayerSharedAvailability | null }> {
  const unavailable = { stillVisible: true, availability: { status: "unavailable", slots: [] } as PlayerSharedAvailability }
  if (match.status !== "confirmed" || (Array.isArray(match.group_members) && match.group_members.length > 0)) return { stillVisible: true, availability: null }
  if (!match.member_a_id || !match.member_b_id || match.member_a_id === match.member_b_id) return unavailable
  const session = relationObject(match.session), round = relationObject(session?.round)
  if (typeof session?.id !== "string" || typeof round?.id !== "string") return unavailable
  const roundId = round.id, sessionId = session.id
  try { validateUuids([sessionId, roundId, match.member_a_id, match.member_b_id]) } catch { return unavailable }
  const participants: [string, string] = [match.member_a_id, match.member_b_id]
  const sourceQuery = supabase.from("match_results")
    .select(`
      id, member_a_id, member_b_id, group_members, status, publication_version,
      session:match_sessions!inner (
        id, status, publication_version,
        round:match_rounds!inner (
          id, is_test,
          submissions:match_round_submissions (member_id, availability)
        )
      )
    `)
    .eq("id", match.id)
    .eq("status", "confirmed")
    .eq("publication_version", match.publication_version)
    .eq("member_a_id", participants[0])
    .eq("member_b_id", participants[1])
    .eq("session.id", sessionId)
    .eq("session.status", "confirmed")
    .eq("session.publication_version", match.publication_version)
    .eq("session.round.id", roundId)
    .in("session.round.submissions.member_id", participants)
    .is("session.round.submissions.cancelled_at", null)
    .or(`member_a_id.eq.${memberId},member_b_id.eq.${memberId}`)
    // This optional enrichment must not repeatedly delay the core result page.
    .abortSignal(AbortSignal.timeout(4_000))
    .retry(false)
    .maybeSingle()
  let source: Awaited<typeof sourceQuery>["data"]
  try {
    const response = await sourceQuery
    if (response.error) return unavailable
    source = response.data
  } catch { return unavailable }
  if (!source) return { stillVisible: false, availability: null }
  const freshSession = relationObject(source.session), freshRound = relationObject(freshSession?.round)
  // Repeat boundaries on the returned shape as well as in the database filters.
  if (source.id !== match.id || source.status !== "confirmed" || !isCurrentPublishedMatch(source)
    || source.publication_version !== match.publication_version || source.member_a_id !== participants[0] || source.member_b_id !== participants[1]
    || (Array.isArray(source.group_members) && source.group_members.length > 0)
    || freshSession?.id !== sessionId || freshRound?.id !== roundId) return { stillVisible: false, availability: null }
  if (!(await filterAccessibleMatchingResults([source])).length) return { stillVisible: false, availability: null }
  return { stillVisible: true, availability: getPlayerSharedAvailability(participants, freshRound.submissions) }
}

function isCurrentPublishedMatch(result: { status: string; publication_version: number; session: unknown }) {
  const session = (Array.isArray(result.session) ? result.session[0] : result.session) as { status?: string; publication_version?: number } | null
  return session?.status === "confirmed" && result.publication_version > 0
    && (result.status === "cancelled" || result.publication_version === session.publication_version)
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
