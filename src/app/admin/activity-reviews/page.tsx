import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { AdminActivityReviewsClient } from "@/components/admin/activity-reviews/AdminActivityReviewsClient"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchAdminActivityReviews } from "@/lib/activity-reviews/queries"
import { fetchAdminReviewRequirements } from "@/lib/activity-reviews/requirements-admin"
import { confirmActivityReviewRosterAction, moderateActivityReportAction, moderateActivityReviewAction, saveActivityReviewSettingsAction, setActivityReviewExemptionAction } from "./actions"

export default async function AdminActivityReviewsPage({ searchParams }: { searchParams: Promise<{ roundId?: string; memberId?: string }> }) {
  const admin = await requireAdmin()
  const params = await searchParams
  const data = await fetchAdminActivityReviews({ roundId: params.roundId, memberId: params.memberId })
  const requirements = data.context ? await fetchAdminReviewRequirements(data.context.roundId) : undefined

  return <div><AdminTopBar admin={admin} title="活动互评" /><AdminActivityReviewsClient data={data} requirements={requirements} actions={{ saveSettingsAction: saveActivityReviewSettingsAction, confirmRosterAction: confirmActivityReviewRosterAction, moderateReviewAction: moderateActivityReviewAction, moderateReportAction: moderateActivityReportAction, setExemptionAction: setActivityReviewExemptionAction }} /></div>
}
