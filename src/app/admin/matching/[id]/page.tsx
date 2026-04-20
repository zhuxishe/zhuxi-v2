import { notFound } from "next/navigation"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchMatchSession, fetchPairRelationships } from "@/lib/queries/matching"
import { buildImportInfoMap } from "@/lib/matching/import-display"
import { supportsImportMetadataColumn } from "@/lib/matching/import-metadata-column"
import { getSingleRelation } from "@/lib/supabase/relations"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { MatchSessionView } from "@/components/admin/MatchSessionView"
import type { EnrichedMember, SubmissionPrefInfo } from "@/components/admin/match-detail-types"
import { createClient } from "@/lib/supabase/server"
import { fetchPoolMembers } from "@/lib/queries/pool-members"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

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
  const roundId = (session as any).round_id as string | null
  const readOnly = !roundId

  // Collect member IDs for pair relationship lookup
  const memberIds = results.flatMap((r: Record<string, unknown>) => {
     
    const a = (r as any).member_a?.id
     
    const b = (r as any).member_b?.id
    return [a, b].filter(Boolean) as string[]
  })

  // Fetch pair relationships, pool members, diagnostics in parallel
  const [pairRelationships, poolMembers, supabase] = await Promise.all([
    fetchPairRelationships([...new Set(memberIds)]),
    roundId ? fetchPoolMembers(id) : Promise.resolve([]),
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

   
  let diagnostics = (diagnosticsRaw ?? []).map((d: any) => ({
    ...d,
    memberData: unmatchedMemberMap.get(d.member_id) ?? null,
  }))

  // Get time slot data: 优先从轮次问卷的 availability 读取，无轮次时从成员档案读
  let timeSlotData: Array<{ preferred_time_slots: string[] }> = []
  let allMemberOptions: { id: string; name: string }[] = []
  const submissionPrefs = new Map<string, SubmissionPrefInfo>()
  const importInfoMap = new Map<string, EnrichedMember["import_info"]>()

  if (roundId) {
    const includeImportMetadata = await supportsImportMetadataColumn(supabase)
    const submissionSelect = includeImportMetadata
      ? `
        member_id, game_type_pref, gender_pref, availability, interest_tags, social_style, import_metadata,
        member:members(id, member_number, member_identity(full_name, nickname))
      `
      : `
        member_id, game_type_pref, gender_pref, availability, interest_tags, social_style,
        member:members(id, member_number, member_identity(full_name, nickname))
      `

    // 轮次匹配：从 match_round_submissions 读取热力图、偏好和手动配对候选
    const { data: subs } = await (supabase as any)
      .from("match_round_submissions")
      .select(submissionSelect)
      .eq("round_id", roundId)

    const submissionRows: any[] = subs ?? []
    const needsFallbackImportLookup = !includeImportMetadata && submissionRows.some((sub: any) => {
      const member = getSingleRelation(sub.member as any)
      return String(member?.member_number ?? "").startsWith("IMP-")
    })
    const legacyRows = needsFallbackImportLookup
      ? ((await (supabase as any)
          .from("legacy_members")
          .select("id, full_name, gender, school, department, interest_tags, social_tags, game_mode, compatibility_score, session_count, match_history")).data ?? []).map((row: any) => ({
            legacy_id: row.id,
            full_name: row.full_name,
            gender: row.gender ?? null,
            school: row.school ?? null,
            department: row.department ?? null,
            interest_tags: row.interest_tags ?? [],
            social_tags: row.social_tags ?? [],
            game_mode: row.game_mode ?? null,
            compatibility_score: row.compatibility_score ?? null,
            session_count: row.session_count ?? null,
            match_history: row.match_history ?? [],
          }))
      : []
    const builtImportInfo = buildImportInfoMap(submissionRows as any[], legacyRows)
    for (const [memberId, info] of Object.entries(builtImportInfo)) {
      importInfoMap.set(memberId, info)
    }

    timeSlotData = submissionRows.map((sub: any) => {
      const avail = (sub.availability ?? {}) as Record<string, string[]>
      const slots: string[] = []
      for (const [date, times] of Object.entries(avail)) {
        for (const t of times) slots.push(`${date}_${t}`)
      }
      return { preferred_time_slots: slots }
    })

    // 构建问卷提交映射（memberId → 本轮偏好），供配对卡片、约束检查和 Popover 展示
    for (const s of submissionRows) {
      submissionPrefs.set(s.member_id, {
        game_type_pref: s.game_type_pref,
        gender_pref: s.gender_pref,
        availability: s.availability as Record<string, string[]> | undefined,
        interest_tags: s.interest_tags as string[] | undefined,
        social_style: s.social_style as string | null | undefined,
      })
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

    allMemberOptions = submissionRows
      .filter((sub: any) => !activeMemberIds.has(sub.member_id))
      .map((sub: any) => {
        const member = getSingleRelation(sub.member as any)
        const identity = getSingleRelation(member?.member_identity as any)
        return {
          id: sub.member_id,
          name: identity?.full_name || identity?.nickname || "未知",
        }
      })
  } else {
    // 历史测试会话缺少可信的问卷快照，这里不再伪造热力图
    timeSlotData = []
  }

  const attachImportInfo = (member: EnrichedMember | null): EnrichedMember | null => {
    if (!member?.id) return member
    return { ...member, import_info: importInfoMap.get(member.id) ?? null }
  }

  const enrichedResults = results.map((result) => ({
    ...result,
    member_a: attachImportInfo(result.member_a as EnrichedMember | null),
    member_b: attachImportInfo(result.member_b as EnrichedMember | null),
    group_member_details: result.group_member_details?.map((member) => attachImportInfo(member as EnrichedMember) as EnrichedMember) ?? null,
  }))
  diagnostics = diagnostics.map((item) => ({
    ...item,
    memberData: attachImportInfo(item.memberData as EnrichedMember | null),
  }))
  const enrichedPoolMembers = poolMembers.map((member) => ({
    ...member,
    memberData: attachImportInfo(member.memberData),
  }))

  return (
    <div>
      <AdminTopBar admin={admin} title={session.session_name ?? "匹配详情"} />
      <div className="px-6 pt-6">
        <Link
          href={roundId ? `/admin/matching/rounds/${roundId}` : "/admin/matching"}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> {roundId ? "返回轮次详情" : "返回匹配管理"}
        </Link>
      </div>
      <MatchSessionView
        session={session}
        results={enrichedResults}
        diagnostics={diagnostics}
        candidates={timeSlotData}
        pairRelationships={pairRelationships}
        poolMembers={enrichedPoolMembers}
        allMemberOptions={allMemberOptions}
        submissionPrefs={Object.fromEntries(submissionPrefs)}
        readOnly={readOnly}
      />
    </div>
  )
}
