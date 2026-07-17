import { requireAdmin } from "@/lib/auth/admin"
import { fetchPastEventReviewAdminState } from "@/lib/queries/past-event-reviews"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { EmptyState } from "@/components/shared/EmptyState"
import { Images } from "lucide-react"
import { ReviewForm } from "./ReviewForm"
import { ReviewList } from "./ReviewList"

export default async function AdminReviewsPage() {
  const admin = await requireAdmin()
  const { reviews, setupRequired } = await fetchPastEventReviewAdminState()

  return (
    <div>
      <AdminTopBar admin={admin} title="大型活动" />
      <div className="p-6 space-y-6">
        <div className="rounded-xl bg-card p-4 text-sm text-muted-foreground ring-1 ring-foreground/10">
          统一维护大型活动资料。Player App 的状态、首页展示与活动库置顶可独立配置；官网往期回顾只有在单独勾选后才会更新。
        </div>
        {setupRequired ? (
          <div className="rounded-xl border border-orange-300 bg-orange-50 p-4 text-sm text-orange-800">
            数据库尚未应用 Player Activity V1 migration（<code>20260717133954</code>），升级前已暂停大型活动编辑。
          </div>
        ) : (
          <>
            <ReviewForm />
            {reviews.length === 0 ? (
              <EmptyState icon={Images} title="暂无大型活动" description="添加第一个大型活动" />
            ) : (
              <ReviewList reviews={reviews} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
