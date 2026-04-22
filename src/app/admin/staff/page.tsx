import { requireAdmin } from "@/lib/auth/admin"
import { fetchStaffAdminState } from "@/lib/queries/staff"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { EmptyState } from "@/components/shared/EmptyState"
import { UserRound } from "lucide-react"
import { StaffProfileForm } from "./StaffProfileForm"
import { StaffProfileList } from "./StaffProfileList"

export default async function AdminStaffPage() {
  const admin = await requireAdmin()
  const { staff, setupRequired } = await fetchStaffAdminState()

  return (
    <div>
      <AdminTopBar admin={admin} title="Staff 管理" />
      <div className="p-6 space-y-6">
        {setupRequired ? (
          <div className="rounded-xl border border-orange-300 bg-orange-50 p-4 text-sm text-orange-800">
            数据库还没有 <code>staff_profiles</code> 表。请先应用
            <code className="mx-1">supabase/migrations/036_staff_profiles.sql</code>
            后再新增 Staff。
          </div>
        ) : (
          <StaffProfileForm />
        )}
        {staff.length === 0 ? (
          <EmptyState icon={UserRound} title="暂无 Staff" description="添加第一位首页展示成员" />
        ) : (
          <StaffProfileList staff={staff} />
        )}
      </div>
    </div>
  )
}
