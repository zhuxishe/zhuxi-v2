import { requireAdmin } from "@/lib/auth/admin"
import { fetchAllStaffProfiles } from "@/lib/queries/staff"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { EmptyState } from "@/components/shared/EmptyState"
import { UserRound } from "lucide-react"
import { StaffProfileForm } from "./StaffProfileForm"
import { StaffProfileList } from "./StaffProfileList"

export default async function AdminStaffPage() {
  const admin = await requireAdmin()
  const staff = await fetchAllStaffProfiles()

  return (
    <div>
      <AdminTopBar admin={admin} title="Staff 管理" />
      <div className="p-6 space-y-6">
        <StaffProfileForm />
        {staff.length === 0 ? (
          <EmptyState icon={UserRound} title="暂无 Staff" description="添加第一位首页展示成员" />
        ) : (
          <StaffProfileList staff={staff} />
        )}
      </div>
    </div>
  )
}
