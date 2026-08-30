import { notFound } from "next/navigation"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchMember360, fetchMemberAudit, isMemberNotFoundError } from "@/lib/queries/member-center"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { Member360Hub } from "@/components/admin/Member360Hub"
import { normalizeMember360Tab, parseMemberDirectoryPage } from "@/components/admin/member-center-utils"

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string; auditPage?: string }>
}

export default async function MemberDetailPage({ params, searchParams }: Props) {
  const admin = await requireAdmin()
  const [{ id }, query] = await Promise.all([params, searchParams])
  const activeTab = normalizeMember360Tab(query.tab)
  let member360
  try {
    member360 = await fetchMember360(id)
  } catch (error) {
    if (isMemberNotFoundError(error)) notFound()
    throw error
  }
  const auditPage = activeTab === "audit"
    ? await fetchMemberAudit({ memberId: id, page: parseMemberDirectoryPage(query.auditPage), pageSize: 100 })
    : null

  return (
    <div>
      <AdminTopBar admin={admin} title="用户与成员 360" />
      <div className="p-6">
        <Member360Hub
          data={member360}
          activeTab={activeTab}
          adminRole={admin.role}
          auditPage={auditPage}
        />
      </div>
    </div>
  )
}
