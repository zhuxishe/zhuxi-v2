import { requireAdmin } from "@/lib/auth/admin"
import { CommunityAdminPage } from "@/components/admin/community/CommunityAdminPage"
import { CommunitySetupWarning } from "@/components/admin/community/CommunitySetupWarning"
import { FaqManager } from "@/components/admin/community/FaqManager"
import { fetchCommunityFaqs } from "../data"

export default async function AdminCommunityQaPage() {
  const admin = await requireAdmin()
  const result = await fetchCommunityFaqs()

  return (
    <CommunityAdminPage
      admin={admin}
      title="问答管理"
      description="维护官方中日文问答、展示顺序和精选状态。已发布的精选问答最多 2 条。"
    >
      {result.setupRequired ? <CommunitySetupWarning /> : <FaqManager faqs={result.faqs} />}
    </CommunityAdminPage>
  )
}
