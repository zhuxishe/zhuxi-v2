import Link from "next/link"
import Image from "next/image"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchAdminScripts } from "@/lib/queries/scripts"
import { fetchPlayerActivitySettingsAdminState } from "@/lib/queries/admin-player-activity"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { PlayerActivitySettingsForm } from "@/components/admin/PlayerActivitySettingsForm"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/EmptyState"
import { Pagination } from "@/components/shared/Pagination"
import { BookOpen } from "lucide-react"
import { rewriteStorageUrl } from "@/lib/storage-url"

interface Props {
  searchParams: Promise<{ page?: string }>
}

export default async function AdminScriptsPage({ searchParams }: Props) {
  const admin = await requireAdmin()
  const params = await searchParams
  const page = params.page ? Math.max(1, parseInt(params.page)) : 1
  const [{ scripts, total }, settingsState] = await Promise.all([
    fetchAdminScripts({ page }),
    fetchPlayerActivitySettingsAdminState(),
  ])

  return (
    <div>
      <AdminTopBar admin={admin} title="剧本管理" />
      <div className="p-6 space-y-4">
        {settingsState.setupRequired ? (
          <div className="rounded-xl border border-orange-300 bg-orange-50 p-4 text-sm text-orange-800">
            数据库尚未应用 Player Activity V1 迁移，暂时不能配置 Player 活动首页。
          </div>
        ) : (
          <PlayerActivitySettingsForm initialLimit={settingsState.settings?.social_home_limit ?? 5} />
        )}

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
                  <div className="relative h-32 w-full overflow-hidden rounded-lg">
                    <Image
                      src={rewriteStorageUrl(s.cover_url)}
                      alt={s.title}
                      fill
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover"
                    />
                  </div>
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
                  {s.is_featured && (
                    <>
                      <span>·</span>
                      <span className="text-primary">精选活动</span>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {s.is_social_script && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">社交剧本</span>}
                  {s.show_on_player_activity && <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-blue-600">活动首页</span>}
                  {s.pin_in_social_library && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-700">剧本库置顶</span>}
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
