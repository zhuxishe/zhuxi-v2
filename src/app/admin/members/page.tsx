import { requireAdmin } from "@/lib/auth/admin"
import { fetchMemberDirectory } from "@/lib/queries/member-center"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { MemberTable } from "@/components/admin/MemberTable"
import { MemberListFilter } from "@/components/admin/MemberListFilter"
import { Pagination } from "@/components/shared/Pagination"
import { parseMemberDirectoryPage } from "@/components/admin/member-center-utils"

interface Props {
  searchParams: Promise<{
    status?: string
    accountStatus?: string
    profileStage?: string
    source?: string
    search?: string
    page?: string
  }>
}

const PAGE_SIZE = 50

export default async function AdminMembersPage({ searchParams }: Props) {
  const admin = await requireAdmin()
  const params = await searchParams
  const page = parseMemberDirectoryPage(params.page)
  const directory = await fetchMemberDirectory({
    status: params.status,
    accountStatus: params.accountStatus,
    profileStage: params.profileStage,
    recordSource: params.source,
    search: params.search,
    page,
    pageSize: PAGE_SIZE,
  })

  return (
    <div>
      <AdminTopBar admin={admin} title="用户与成员中心" />
      <div className="p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold">用户与成员目录</h1>
          <p className="mt-1 text-sm text-muted-foreground">一个 canonical member ID 对应登录账号、申请资料和后续业务记录。</p>
        </div>
        <MemberListFilter
          key={params.search ?? ""}
          currentStatus={params.status ?? "all"}
          currentAccountStatus={params.accountStatus ?? "all"}
          currentProfileStage={params.profileStage ?? "all"}
          currentRecordSource={params.source ?? "all"}
          currentSearch={params.search ?? ""}
          canSearchHighRisk={admin.role === "super_admin"}
        />
        <div className="rounded-xl bg-card ring-1 ring-foreground/10">
          <MemberTable
            members={directory.items}
            canViewHighRisk={admin.role === "super_admin"}
            redactedFields={directory.redactedFields}
          />
        </div>
        <Pagination total={directory.total} page={directory.page} pageSize={directory.pageSize} />
      </div>
    </div>
  )
}
