import { requireAdmin } from "@/lib/auth/admin"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { RoundCreateForm } from "@/components/admin/RoundCreateForm"

export default async function NewRoundPage() {
  const admin = await requireAdmin()

  return (
    <div>
      <AdminTopBar admin={admin} title="创建新轮次" />
      <div className="p-6">
        <RoundCreateForm />
      </div>
    </div>
  )
}
