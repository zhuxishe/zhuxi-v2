import Link from "next/link"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchAdminScripts } from "@/lib/queries/scripts"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/EmptyState"
import { Pagination } from "@/components/shared/Pagination"
import { BookOpen } from "lucide-react"

interface Props {
  searchParams: Promise<{ page?: string }>
}

export default async function AdminScriptsPage({ searchParams }: Props) {
  const admin = await requireAdmin()
  const params = await searchParams
  const page = params.page ? Math.max(1, parseInt(params.page)) : 1
  const { scripts, total } = await fetchAdminScripts({ page })

  return (
    <div>
      <AdminTopBar admin={admin} title="剧本管理" />
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">共 {total} 个剧本</p>
          <Link href="/admin/scripts/new">
            <Button>添加剧本</Button>
          </Link>
        </div>

        {scripts.length === 0 ? (
          <EmptyState icon={BookOpen} title="暂无剧本" description="添加第一个剧本到库中" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {scripts.map((s) => (
              <Link key={s.id} href={`/admin/scripts/${s.id}`}
                className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 hover:ring-primary/30 transition-all space-y-2"
              >
                {s.cover_url && (
                  <img src={s.cover_url} alt={s.title} className="w-full h-32 object-cover rounded-lg" />
                )}
                <p className="text-sm font-semibold">{s.title}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{s.player_count_min}-{s.player_count_max}人</span>
                  <span>·</span>
                  <span>{s.duration_minutes}分钟</span>
                  <span>·</span>
                  <span className={s.is_published ? "text-green-600" : "text-orange-500"}>
                    {s.is_published ? "已发布" : "草稿"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}

        <Pagination total={total} page={page} pageSize={24} />
      </div>
    </div>
  )
}
