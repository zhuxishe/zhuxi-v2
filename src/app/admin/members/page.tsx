import { requireAdmin } from "@/lib/auth/admin"
import { fetchMembers } from "@/lib/queries/members"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { MemberTable } from "@/components/admin/MemberTable"
import { MemberListFilter } from "@/components/admin/MemberListFilter"
import { Pagination } from "@/components/shared/Pagination"

interface Props {
  searchParams: Promise<{ status?: string; search?: string; page?: string }>
}

export default async function AdminMembersPage({ searchParams }: Props) {
  const admin = await requireAdmin()
  const params = await searchParams
  const page = params.page ? Math.max(1, parseInt(params.page)) : 1
  const { members, total } = await fetchMembers({
    status: params.status,
    search: params.search,
    page,
  })

  return (
    <div>
      <AdminTopBar admin={admin} title="成员管理" />
      <div className="p-6 space-y-4">
        <MemberListFilter
          currentStatus={params.status ?? "all"}
          currentSearch={params.search ?? ""}
        />
        <div className="rounded-xl bg-card ring-1 ring-foreground/10">
          <MemberTable members={members} />
        </div>
        <Pagination total={total} page={page} pageSize={50} />
      </div>
    </div>
  )
}
