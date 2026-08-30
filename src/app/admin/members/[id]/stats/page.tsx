import { notFound } from "next/navigation"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchMember360, isMemberNotFoundError } from "@/lib/queries/member-center"
import { fetchMemberStats, fetchMemberNotes } from "@/lib/queries/activities"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { StatsCard } from "@/components/admin/StatsCard"
import { MemberStatsAdminEditor } from "@/components/admin/MemberStatsAdminEditor"

interface Props {
  params: Promise<{ id: string }>
}

export default async function MemberStatsPage({ params }: Props) {
  const admin = await requireAdmin()
  const { id } = await params

  let member
  try {
    member = await fetchMember360(id)
  } catch (error) {
    if (isMemberNotFoundError(error)) notFound()
    throw error
  }

  const stats = await fetchMemberStats(id)
  const notes = await fetchMemberNotes(id)
  const name = typeof member.identity?.full_name === "string" ? member.identity.full_name : "未知"

  return (
    <div>
      <AdminTopBar admin={admin} title={`${name} — 统计`} />
      <div className="p-6 max-w-2xl space-y-4">
        <StatsCard stats={stats} />
        <MemberStatsAdminEditor
          memberId={id}
          stats={stats}
          notes={notes}
          canOverrideRaw={admin.role === "super_admin"}
        />
      </div>
    </div>
  )
}
