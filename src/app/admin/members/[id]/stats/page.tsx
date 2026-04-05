import { notFound } from "next/navigation"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchMemberDetail } from "@/lib/queries/members"
import { fetchMemberStats, fetchMemberNotes } from "@/lib/queries/activities"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { StatsCard } from "@/components/admin/StatsCard"

interface Props {
  params: Promise<{ id: string }>
}

export default async function MemberStatsPage({ params }: Props) {
  const admin = await requireAdmin()
  const { id } = await params

  let member
  try { member = await fetchMemberDetail(id) } catch { notFound() }

  const stats = await fetchMemberStats(id)
  const notes = await fetchMemberNotes(id)
  const name = member.member_identity?.full_name ?? "未知"

  return (
    <div>
      <AdminTopBar admin={admin} title={`${name} — 统计`} />
      <div className="p-6 max-w-2xl space-y-4">
        <StatsCard stats={stats} />

        <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-3">
          <h3 className="text-sm font-semibold">运营备注 ({notes.length})</h3>
          {notes.length === 0 ? (
            <p className="text-xs text-muted-foreground">暂无备注</p>
          ) : (
            notes.map((n) => (
              <div key={n.id} className="rounded-lg bg-muted/30 px-3 py-2 text-sm">
                <p>{n.note}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(n.created_at).toLocaleString("zh-CN")}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
