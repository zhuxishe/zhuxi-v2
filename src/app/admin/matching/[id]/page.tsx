import { notFound } from "next/navigation"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchMatchSession, fetchMatchCandidates, fetchPairRelationships } from "@/lib/queries/matching"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { MatchSessionView } from "@/components/admin/MatchSessionView"
import { createClient } from "@/lib/supabase/server"

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
  const pairRelationships = await fetchPairRelationships([...new Set(memberIds)])

  // Fetch unmatched diagnostics for this session
  const supabase = await createClient()
  const { data: diagnostics } = await supabase
    .from("unmatched_diagnostics")
    .select("*, member:members(member_identity(full_name))")
    .eq("session_id", id)

  // Get time slot data from approved candidates
  const candidates = await fetchMatchCandidates()
  const timeSlotData = candidates.map((c) => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    preferred_time_slots: ((c as any).member_interests?.preferred_time_slots ?? []) as string[],
  }))

  return (
    <div>
      <AdminTopBar admin={admin} title={session.session_name ?? "匹配详情"} />
      <MatchSessionView
        session={session}
        results={results}
        diagnostics={diagnostics ?? []}
        candidates={timeSlotData}
        pairRelationships={pairRelationships}
      />
    </div>
  )
}
