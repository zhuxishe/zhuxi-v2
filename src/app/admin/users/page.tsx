import { requireAdmin } from "@/lib/auth/admin"
import { AdminUserList } from "@/components/admin/AdminUserList"

export default async function AdminUsersPage() {
  await requireAdmin()
  return <AdminUserList />
}
