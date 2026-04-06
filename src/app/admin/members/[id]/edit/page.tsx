import { notFound } from "next/navigation"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchMemberDetail } from "@/lib/queries/members"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { MemberEditForm } from "@/components/admin/MemberEditForm"

interface Props {
  params: Promise<{ id: string }>
}

export default async function MemberEditPage({ params }: Props) {
  const admin = await requireAdmin()
  const { id } = await params

  let member
  try {
    member = await fetchMemberDetail(id)
  } catch {
    notFound()
  }

  return (
    <div>
      <AdminTopBar admin={admin} title="编辑成员信息" />
      <div className="p-6">
        <MemberEditForm memberId={id} member={member} />
      </div>
    </div>
  )
}
