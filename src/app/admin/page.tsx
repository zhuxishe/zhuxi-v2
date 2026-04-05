import { requireAdmin } from "@/lib/auth/admin"
import { fetchDashboardStats } from "@/lib/queries/admin"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { DashboardStats } from "@/components/admin/DashboardStats"

export default async function AdminDashboardPage() {
  const admin = await requireAdmin()
  const stats = await fetchDashboardStats()

  return (
    <div>
      <AdminTopBar admin={admin} title="仪表板" />
      <div className="p-6 space-y-6">
        <DashboardStats stats={stats} />
      </div>
    </div>
  )
}
