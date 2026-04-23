import { requireAdmin } from "@/lib/auth/admin"
import { fetchRounds } from "@/lib/queries/rounds"
import { fetchMatchSessions } from "@/lib/queries/matching"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { MatchingWorkbench } from "@/components/admin/MatchingWorkbench"

export default async function MatchingPage() {
  const admin = await requireAdmin()
  const [rounds, sessions] = await Promise.all([fetchRounds(), fetchMatchSessions()])

  return (
    <div>
      <AdminTopBar admin={admin} title="匹配管理" />
      <div className="p-6 space-y-6">
        <MatchingWorkbench rounds={rounds} sessions={sessions} />
      </div>
    </div>
  )
}
