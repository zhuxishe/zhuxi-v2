import { notFound } from "next/navigation"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchMatchSession, fetchMatchCandidates, fetchPairRelationships } from "@/lib/queries/matching"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { MatchSessionView } from "@/components/admin/MatchSessionView"
import { createClient } from "@/lib/supabase/server"
import { fetchPoolMembers } from "@/lib/queries/pool-members"

interface Props {
  params: Promise<{ id: string }>
}

export default async function MatchSessionDetailPage({ params }: Props) {
  const admin = await requireAdmin()
  const { id } = await params

  let data
  try {
    data = await fetchMatchSession(id)
  } catch {
    notFound()
  }

  const { session, results } = data

  // Collect member IDs for pair relationship lookup
  const memberIds = results.flatMap((r: Record<string, unknown>) => {
     
    const a = (r as any).member_a?.id
     
    const b = (r as any).member_b?.id
    return [a, b].filter(Boolean) as string[]
  })

  // Fetch pair relationships, pool members, diagnostics in parallel
  const [pairRelationships, poolMembers, supabase] = await Promise.all([
    fetchPairRelationships([...new Set(memberIds)]),
    fetchPoolMembers(id),
    createClient(),
  ])

  const memberSelect = `
    id, member_number,
    member_identity (full_name, nickname, school_name, gender, hobby_tags, nationality, degree_level, department),
    member_interests (game_type_pref, scenario_theme_tags, preferred_time_slots, social_goal_primary),
    member_personality (expression_style_tags, group_role_tags, extroversion, warmup_speed),
    member_boundaries (preferred_gender_mix)
  `

  const { data: diagnosticsRaw } = await supabase
    .from("unmatched_diagnostics")
    .select(`*, member:members(member_identity(full_name))`)
    .eq("session_id", id)

  // Fetch enriched member data for unmatched diagnostics (for popovers)
  const unmatchedMemberIds = (diagnosticsRaw ?? []).map((d) => d.member_id).filter(Boolean)
  let unmatchedMemberMap = new Map<string, unknown>()
  if (unmatchedMemberIds.length > 0) {
    const { data: umData } = await supabase
      .from("members")
      .select(memberSelect)
      .in("id", unmatchedMemberIds)
    for (const m of umData ?? []) unmatchedMemberMap.set(m.id, m)
  }

   
  const diagnostics = (diagnosticsRaw ?? []).map((d: any) => ({
    ...d,
    memberData: unmatchedMemberMap.get(d.member_id) ?? null,
  }))

  // Get time slot data: 优先从轮次问卷的 availability 读取，无轮次时从成员档案读
  const candidates = await fetchMatchCandidates()
   
  const roundId = (session as any).round_id as string | null
  let timeSlotData: Array<{ preferred_time_slots: string[] }> = []

  if (roundId) {
    // 轮次匹配：从 match_round_submissions.availability 读取
    const { data: subs } = await supabase
      .from("match_round_submissions")
      .select("availability")
      .eq("round_id", roundId)
    timeSlotData = (subs ?? []).map((sub) => {
      const avail = (sub.availability ?? {}) as Record<string, string[]>
      const slots: string[] = []
      for (const [date, times] of Object.entries(avail)) {
        for (const t of times) slots.push(`${date}_${t}`)
      }
      return { preferred_time_slots: slots }
    })
  } else {
    // 直接匹配（测试）：从成员档案读
    timeSlotData = candidates.map((c) => ({
       
      preferred_time_slots: ((c as any).member_interests?.preferred_time_slots ?? []) as string[],
    }))
  }

  // 构建问卷提交映射（memberId → 本轮偏好），供配对卡片、约束检查和 Popover 展示
  let submissionPrefs = new Map<string, {
    game_type_pref: string; gender_pref: string
    availability?: Record<string, string[]>; interest_tags?: string[]; social_style?: string | null
  }>()
  if (roundId) {
    const { data: subs } = await supabase
      .from("match_round_submissions")
      .select("member_id, game_type_pref, gender_pref, availability, interest_tags, social_style")
      .eq("round_id", roundId)
    for (const s of subs ?? []) {
      submissionPrefs.set(s.member_id, {
        game_type_pref: s.game_type_pref,
        gender_pref: s.gender_pref,
        availability: s.availability as Record<string, string[]> | undefined,
        interest_tags: s.interest_tags as string[] | undefined,
        social_style: s.social_style as string | null | undefined,
      })
    }
  }

  // 排除已在活跃配对中的成员（防止手动配对时选到已匹配的人）
  const activeMemberIds = new Set<string>()
  for (const r of results) {
     
    const row = r as any
    if (row.status === "cancelled") continue
    if (row.member_a_id) activeMemberIds.add(row.member_a_id)
    if (row.member_b_id) activeMemberIds.add(row.member_b_id)
    if (Array.isArray(row.group_members)) {
      for (const gm of row.group_members) activeMemberIds.add(gm)
    }
  }

  const allMemberOptions = candidates
    .filter((c) => !activeMemberIds.has(c.id))
    .map((c) => {
       
      const identity = (c as any).member_identity
      const name = (Array.isArray(identity) ? identity[0] : identity)?.full_name
        || (Array.isArray(identity) ? identity[0] : identity)?.nickname
        || "未知"
      return { id: c.id, name }
    })

  return (
    <div>
      <AdminTopBar admin={admin} title={session.session_name ?? "匹配详情"} />
      <MatchSessionView
        session={session}
        results={results}
        diagnostics={diagnostics}
        candidates={timeSlotData}
        pairRelationships={pairRelationships}
        poolMembers={poolMembers}
        allMemberOptions={allMemberOptions}
        submissionPrefs={Object.fromEntries(submissionPrefs)}
      />
    </div>
  )
}
