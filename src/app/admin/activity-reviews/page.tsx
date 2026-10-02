import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { AdminActivityReviewsClient } from "@/components/admin/activity-reviews/AdminActivityReviewsClient"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchAdminActivityReviews } from "@/lib/activity-reviews/queries"
import { confirmActivityReviewRosterAction, moderateActivityReportAction, moderateActivityReviewAction, saveActivityReviewSettingsAction } from "./actions"

export default async function AdminActivityReviewsPage({ searchParams }: { searchParams: Promise<{ roundId?: string; memberId?: string }> }) {
  const admin = await requireAdmin()
  const params = await searchParams
  const data = await fetchAdminActivityReviews({ roundId: params.roundId, memberId: params.memberId })

  return <div><AdminTopBar admin={admin} title="活动互评" /><AdminActivityReviewsClient data={data} actions={{ saveSettingsAction: saveActivityReviewSettingsAction, confirmRosterAction: confirmActivityReviewRosterAction, moderateReviewAction: moderateActivityReviewAction, moderateReportAction: moderateActivityReportAction }} /></div>
}
