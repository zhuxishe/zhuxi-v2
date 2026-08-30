import { notFound } from "next/navigation"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchMember360, isMemberNotFoundError, member360ToLegacyDetail } from "@/lib/queries/member-center"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { MemberEditForm } from "@/components/admin/MemberEditForm"

interface Props {
  params: Promise<{ id: string }>
}

export default async function MemberEditPage({ params }: Props) {
  const admin = await requireAdmin()
  const { id } = await params

  let member360
  try {
    member360 = await fetchMember360(id)
  } catch (error) {
    if (isMemberNotFoundError(error)) notFound()
    throw error
  }
  const member = member360ToLegacyDetail(member360)

  return (
    <div>
      <AdminTopBar admin={admin} title="编辑成员信息" />
      <div className="p-6">
        <MemberEditForm memberId={id} member={member} />
      </div>
    </div>
  )
}
