import { requireAdmin } from "@/lib/auth/admin"
import { fetchDashboardStats } from "@/lib/queries/admin"
import { fetchMatchSessions } from "@/lib/queries/matching"
import { fetchRounds } from "@/lib/queries/rounds"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { AdminOperationsDashboard } from "@/components/admin/AdminOperationsDashboard"

export default async function AdminDashboardPage() {
  const admin = await requireAdmin()
  const [stats, rounds, sessions] = await Promise.all([
    fetchDashboardStats(),
    fetchRounds(),
    fetchMatchSessions(),
  ])

  return (
    <div>
      <AdminTopBar admin={admin} title="仪表板" />
      <div className="p-6 space-y-6">
        <AdminOperationsDashboard stats={stats} rounds={rounds} sessions={sessions} />
      </div>
    </div>
  )
}
