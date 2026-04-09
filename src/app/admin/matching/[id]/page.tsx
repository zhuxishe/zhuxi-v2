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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = (r as any).member_a?.id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const diagnostics = (diagnosticsRaw ?? []).map((d: any) => ({
    ...d,
    memberData: unmatchedMemberMap.get(d.member_id) ?? null,
  }))

  // Get time slot data from approved candidates + build allMemberOptions for manual pairing
  const candidates = await fetchMatchCandidates()
  const timeSlotData = candidates.map((c) => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    preferred_time_slots: ((c as any).member_interests?.preferred_time_slots ?? []) as string[],
  }))
  const allMemberOptions = candidates.map((c) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      />
    </div>
  )
}
