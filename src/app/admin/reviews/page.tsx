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
      <AdminTopBar admin={admin} title="往期回顾" />
      <div className="p-6 space-y-6">
        <div className="rounded-xl bg-card p-4 text-sm text-muted-foreground ring-1 ring-foreground/10">
          用来维护公开页“往期回顾”。封面图建议使用已上传到 Supabase Storage 的图片 URL。
        </div>
        {setupRequired ? (
          <div className="rounded-xl border border-orange-300 bg-orange-50 p-4 text-sm text-orange-800">
            数据库还没有 <code>past_event_reviews</code> 表。请先应用
            <code className="mx-1">supabase/migrations/037_past_event_reviews.sql</code>。
          </div>
        ) : (
          <ReviewForm />
        )}
        {reviews.length === 0 ? (
          <EmptyState icon={Images} title="暂无往期回顾" description="添加第一条活动图文" />
        ) : (
          <ReviewList reviews={reviews} />
        )}
      </div>
    </div>
  )
}
