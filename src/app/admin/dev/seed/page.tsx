import { requireAdmin } from "@/lib/auth/admin"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { SeedForm } from "./SeedForm"

export default async function SeedPage() {
  const admin = await requireAdmin()

  return (
    <div>
      <AdminTopBar admin={admin} title="生成测试数据" />
      <div className="p-6 max-w-lg">
        <p className="text-sm text-muted-foreground mb-6">
          批量生成假成员、关联档案和匹配轮次问卷，用于测试匹配算法。
          生成的数据 email 以 @fake.local 结尾。
        </p>
        <SeedForm />
      </div>
    </div>
  )
}
