import { requireAdmin } from "@/lib/auth/admin"
import { AdminUserList } from "@/components/admin/AdminUserList"
import { fetchAdminList } from "./actions"
import { notFound } from "next/navigation"

export default async function AdminUsersPage() {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") notFound()
  const result = await fetchAdminList()
  return <AdminUserList initialAdmins={result.data ?? []} />
}
