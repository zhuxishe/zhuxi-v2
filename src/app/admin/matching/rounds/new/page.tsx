import { requireAdmin } from "@/lib/auth/admin"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { RoundCreateForm } from "@/components/admin/RoundCreateForm"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default async function NewRoundPage() {
  const admin = await requireAdmin()

  return (
    <div>
      <AdminTopBar admin={admin} title="创建新轮次" />
      <div className="p-6">
        <Link
          href="/admin/matching"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> 返回匹配管理
        </Link>
        <RoundCreateForm />
      </div>
    </div>
  )
}
