import Link from "next/link"
import Image from "next/image"
import { requireAdmin } from "@/lib/auth/admin"
import {
  ADMIN_SCRIPT_PAGE_SIZE,
  fetchAdminScriptsV2,
  type AdminScriptKind,
  type AdminScriptStatus,
  type AdminScriptSurface,
  type AdminScriptView,
} from "@/lib/queries/admin-scripts"
import { fetchPlayerActivitySettingsAdminState } from "@/lib/queries/admin-player-activity"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { PlayerActivitySettingsForm } from "@/components/admin/PlayerActivitySettingsForm"
import { ContentMediaCleanupJobs } from "@/components/admin/ContentMediaCleanupJobs"
import { LegacyScriptCoverMigration } from "@/components/admin/LegacyScriptCoverMigration"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/EmptyState"
import { Pagination } from "@/components/shared/Pagination"
import { BookOpen, Search } from "lucide-react"
import { rewriteStorageUrl } from "@/lib/storage-url"
import { fetchPendingContentMediaCleanupJobs } from "@/lib/content-media-cleanup"
import { fetchLegacyScriptCoverMigrationState } from "@/lib/legacy-script-cover-query"

export const maxDuration = 60

interface Props {
  searchParams: Promise<{
    page?: string
    q?: string
    status?: string
    surface?: string
    kind?: string
    view?: string
  }>
}

export default async function AdminScriptsPage({ searchParams }: Props) {
  const admin = await requireAdmin()
  const params = await searchParams
  const page = params.page ? Math.max(1, parseInt(params.page)) : 1
  const view = oneOf(params.view, ["current", "archived"] as const, "current")
  const status = oneOf(params.status, ["all", "published", "draft"] as const, "all")
  const surface = oneOf(params.surface, ["all", "public", "player", "hidden"] as const, "all")
  const kind = oneOf(params.kind, ["all", "social", "other"] as const, "all")
  const [{ scripts, total }, settingsState, cleanupJobs, legacyCoverState] = await Promise.all([
    fetchAdminScriptsV2({
      page,
      query: params.q,
      view: view as AdminScriptView,
      status: status as AdminScriptStatus,
      surface: surface as AdminScriptSurface,
      kind: kind as AdminScriptKind,
    }),
    fetchPlayerActivitySettingsAdminState(),
    admin.role === "super_admin"
      ? fetchPendingContentMediaCleanupJobs("script")
      : Promise.resolve([]),
    fetchLegacyScriptCoverMigrationState(),
  ])

  return (
    <div>
      <AdminTopBar admin={admin} title="剧本管理" />
      <div className="p-6 space-y-4">
        <ContentMediaCleanupJobs jobs={cleanupJobs} />
        <LegacyScriptCoverMigration
          initialCount={legacyCoverState.count}
          initialError={legacyCoverState.error}
        />
        {settingsState.setupRequired ? (
          <div className="rounded-xl border border-orange-300 bg-orange-50 p-4 text-sm text-orange-800">
            数据库尚未应用内容管理 V2 扩展迁移，暂时不能配置玩家端栏目。
          </div>
        ) : (
          <PlayerActivitySettingsForm
            canManage={admin.role === "super_admin"}
            initialSettings={{
              largeActivitiesEnabled: settingsState.settings?.large_activities_enabled ?? true,
              socialScriptsEnabled: settingsState.settings?.social_scripts_enabled ?? true,
              scriptLibraryEnabled: settingsState.settings?.script_library_enabled ?? true,
              largeHomeLimit: settingsState.settings?.large_home_limit ?? 2,
              socialHomeLimit: settingsState.settings?.social_home_limit ?? 5,
            }}
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link
              href="/admin/scripts"
              className={`rounded-lg px-3 py-1.5 text-sm ${view === "current" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              当前内容
            </Link>
            <Link
              href="/admin/scripts?view=archived"
              className={`rounded-lg px-3 py-1.5 text-sm ${view === "archived" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              回收站
            </Link>
          </div>
          <Link href="/admin/scripts/new">
            <Button>添加剧本</Button>
          </Link>
        </div>

        <form className="grid gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1fr)_repeat(3,auto)_auto]">
          <input type="hidden" name="view" value={view} />
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
            <input
              name="q"
              defaultValue={params.q ?? ""}
              maxLength={100}
              placeholder="搜索标题或作者"
              className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </label>
          <FilterSelect name="status" defaultValue={status} label="发布状态" options={[["all", "全部状态"], ["published", "官网已发布"], ["draft", "官网未发布"]]} />
          <FilterSelect name="surface" defaultValue={surface} label="展示端" options={[["all", "全部展示端"], ["public", "官网显示"], ["player", "玩家端显示"], ["hidden", "两端隐藏"]]} />
          <FilterSelect name="kind" defaultValue={kind} label="剧本类型" options={[["all", "全部类型"], ["social", "社交剧本"], ["other", "其他剧本"]]} />
          <Button type="submit" variant="outline" size="sm">筛选</Button>
        </form>

        <p className="text-sm text-muted-foreground">
          {view === "archived" ? "回收站" : "当前内容"}共 {total} 个剧本
        </p>

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
                      unoptimized
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
                    {s.is_published ? "官网显示" : "官网隐藏"}
                  </span>
                  {s.is_featured && (
                    <>
                      <span>·</span>
                      <span className="text-primary">精选活动</span>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <span className={`rounded-full px-2 py-0.5 ${s.is_player_visible ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                    {s.is_player_visible ? "玩家端显示" : "玩家端隐藏"}
                  </span>
                  {s.is_social_script && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">社交剧本</span>}
                  {s.show_on_player_activity && <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-blue-600">活动首页</span>}
                  {s.pin_in_social_library && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-700">剧本库置顶</span>}
                </div>
              </Link>
            ))}
          </div>
        )}

        <Pagination total={total} page={page} pageSize={ADMIN_SCRIPT_PAGE_SIZE} />
      </div>
    </div>
  )
}

function FilterSelect({
  name,
  defaultValue,
  label,
  options,
}: {
  name: string
  defaultValue: string
  label: string
  options: ReadonlyArray<readonly [string, string]>
}) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        aria-label={label}
        className="h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
      >
        {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </label>
  )
}

function oneOf<const T extends readonly string[]>(
  value: string | undefined,
  choices: T,
  fallback: T[number],
): T[number] {
  return choices.includes(value as T[number]) ? value as T[number] : fallback
}
