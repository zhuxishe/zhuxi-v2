import Link from "next/link"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchPastEventReviewAdminState } from "@/lib/queries/past-event-reviews"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { EmptyState } from "@/components/shared/EmptyState"
import { Pagination } from "@/components/shared/Pagination"
import { Button } from "@/components/ui/button"
import { Images } from "lucide-react"
import { ReviewForm } from "./ReviewForm"
import { ReviewList } from "./ReviewList"
import { ContentMediaCleanupJobs } from "@/components/admin/ContentMediaCleanupJobs"
import { fetchPendingContentMediaCleanupJobs } from "@/lib/content-media-cleanup"

type ReviewStatus = "draft" | "published" | "cancelled"

interface Props {
  searchParams: Promise<{
    search?: string
    status?: string
    view?: string
    page?: string
  }>
}

const STATUS_OPTIONS: Array<{ value: "" | ReviewStatus; label: string }> = [
  { value: "", label: "全部状态" },
  { value: "draft", label: "草稿" },
  { value: "published", label: "已发布" },
  { value: "cancelled", label: "已取消" },
]

export default async function AdminReviewsPage({ searchParams }: Props) {
  const admin = await requireAdmin()
  const params = await searchParams
  const parsedPage = Number.parseInt(params.page ?? "1", 10)
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1
  const status = STATUS_OPTIONS.find((option) => option.value && option.value === params.status)?.value || undefined
  const archived = params.view === "archived"
  const [{ reviews, setupRequired, total, pageSize }, cleanupJobs] = await Promise.all([
    fetchPastEventReviewAdminState({
      search: params.search,
      status,
      archived,
      page,
    }),
    admin.role === "super_admin"
      ? fetchPendingContentMediaCleanupJobs("past_event_review")
      : Promise.resolve([]),
  ])

  return (
    <div>
      <AdminTopBar admin={admin} title="大型活动" />
      <div className="p-6 space-y-6">
        <ContentMediaCleanupJobs jobs={cleanupJobs} />
        <div className="rounded-xl bg-card p-4 text-sm text-muted-foreground ring-1 ring-foreground/10">
          统一维护大型活动资料。玩家端的状态、首页展示与活动库置顶可独立配置；官网往期回顾只有在单独勾选后才会更新。
        </div>
        <div className="flex flex-wrap items-center gap-2" aria-label="大型活动视图">
          <Link
            href="/admin/reviews"
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${!archived ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground ring-1 ring-border"}`}
          >
            当前内容
          </Link>
          <Link
            href="/admin/reviews?view=archived"
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${archived ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground ring-1 ring-border"}`}
          >
            回收站
          </Link>
        </div>
        <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          {archived && <input type="hidden" name="view" value="archived" />}
          <label className="grid min-w-56 flex-1 gap-1 text-xs font-medium text-muted-foreground">
            搜索
            <input
              name="search"
              defaultValue={params.search ?? ""}
              placeholder="标题、简介、地点或来源键"
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            状态
            <select
              name="status"
              defaultValue={status ?? ""}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {STATUS_OPTIONS.map((option) => <option key={option.value || "all"} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <Button type="submit">筛选</Button>
          <Link href={archived ? "/admin/reviews?view=archived" : "/admin/reviews"} className="px-2 py-2 text-sm text-muted-foreground hover:text-foreground">
            清除
          </Link>
        </form>
        {setupRequired ? (
          <div className="rounded-xl border border-orange-300 bg-orange-50 p-4 text-sm text-orange-800">
            数据库尚未应用内容管理 V2 数据库迁移（<code>20260903062011</code>），升级前已暂停大型活动编辑。
          </div>
        ) : (
          <>
            {!archived && <ReviewForm />}
            {reviews.length === 0 ? (
              <EmptyState
                icon={Images}
                title={archived ? "回收站为空" : "当前条件下暂无大型活动"}
                description={archived ? "归档的大型活动会显示在这里" : "添加活动或调整筛选条件"}
              />
            ) : (
              <ReviewList
                reviews={reviews}
                total={total}
                archived={archived}
                canManageRecycleBin={admin.role === "super_admin"}
              />
            )}
            <Pagination total={total} page={page} pageSize={pageSize} />
          </>
        )}
      </div>
    </div>
  )
}
