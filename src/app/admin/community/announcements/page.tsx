import { requireAdmin } from "@/lib/auth/admin"
import { AnnouncementManager } from "@/components/admin/community/AnnouncementManager"
import { CommunityAdminPage } from "@/components/admin/community/CommunityAdminPage"
import { CommunitySetupWarning } from "@/components/admin/community/CommunitySetupWarning"
import { fetchCommunityAnnouncements } from "../data"

export default async function AdminCommunityAnnouncementsPage() {
  const admin = await requireAdmin()
  const result = await fetchCommunityAnnouncements()

  return (
    <CommunityAdminPage
      admin={admin}
      title="公告管理"
      description="维护中日文公告、展示时间、置顶顺序和会员通知。公告在会员端原位展开。"
    >
      {result.setupRequired ? <CommunitySetupWarning /> : <AnnouncementManager announcements={result.announcements} />}
    </CommunityAdminPage>
  )
}
