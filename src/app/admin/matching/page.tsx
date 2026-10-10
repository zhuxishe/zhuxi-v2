import { requireAdmin } from "@/lib/auth/admin"
import { fetchRounds } from "@/lib/queries/rounds"
import { fetchMatchSessions } from "@/lib/queries/matching"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { MatchingWorkbench } from "@/components/admin/MatchingWorkbench"
import { DeletedRoundsTrash } from "@/components/admin/DeletedRoundsTrash"
import { fetchDeletedRounds } from "@/lib/queries/deleted-rounds"

export default async function MatchingPage({ searchParams }: { searchParams: Promise<{ deletedPage?: string | string[] }> }) {
  const admin = await requireAdmin()
  const query = await searchParams
  let trashError = false
  const [rounds, sessions, deleted] = await Promise.all([
    fetchRounds(), fetchMatchSessions(),
    admin.role === "super_admin" ? fetchDeletedRounds(query.deletedPage).catch((error) => {
      console.error("[MatchingPage] deleted activities", error)
      trashError = true
      return null
    }) : Promise.resolve(null),
  ])

  return (
    <div>
      <AdminTopBar admin={admin} title="匹配管理" />
      <div className="p-6 space-y-6">
        <MatchingWorkbench rounds={rounds} sessions={sessions} />
        <DeletedRoundsTrash data={deleted} canView={admin.role === "super_admin"} expanded={query.deletedPage !== undefined} error={trashError} />
      </div>
    </div>
  )
}
