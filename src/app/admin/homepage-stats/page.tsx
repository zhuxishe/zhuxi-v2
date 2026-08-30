import { notFound } from "next/navigation"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { HomepageStatsEditor } from "@/components/admin/homepage-stats/HomepageStatsEditor"
import { requireAdmin } from "@/lib/auth/admin"
import { getAdminHomepageSchoolStatsState } from "@/lib/queries/homepage-school-stats"

export default async function AdminHomepageStatsPage() {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") notFound()

  const state = await getAdminHomepageSchoolStatsState()

  return (
    <div className="min-h-full bg-muted/20">
      <AdminTopBar admin={admin} title="主页统计" />
      <main className="space-y-6 p-4 sm:p-6">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground">主页学校统计</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            维护主页公开展示的总人数、学校总数和精选学校分布。保存后无需重新部署，新访问或刷新主页即可看到最新版本。
          </p>
        </div>

        {state.setupRequired || !state.stats ? (
          <section role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
            <h2 className="font-semibold">主页统计数据库尚未就绪</h2>
            <p className="mt-1 leading-6">请先应用主页学校统计数据库迁移。迁移完成前，主页仍会使用当前静态回退数据。</p>
          </section>
        ) : (
          <HomepageStatsEditor initialStats={state.stats} history={state.history} />
        )}
      </main>
    </div>
  )
}
