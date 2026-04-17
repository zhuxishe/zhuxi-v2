import { requireAdmin } from "@/lib/auth/admin"
import { AdminUserList } from "@/components/admin/AdminUserList"
import { fetchAdminList } from "./actions"

export default async function AdminUsersPage() {
  await requireAdmin()
  const result = await fetchAdminList()
  return <AdminUserList initialAdmins={result.data ?? []} />
}
