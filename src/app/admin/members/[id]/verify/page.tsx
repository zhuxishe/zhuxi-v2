import { notFound } from "next/navigation"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchMember360, isMemberNotFoundError, member360ToLegacyDetail } from "@/lib/queries/member-center"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { VerificationPanel } from "@/components/admin/VerificationPanel"

interface Props {
  params: Promise<{ id: string }>
}

export default async function MemberVerifyPage({ params }: Props) {
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
  const verification = member.member_verification
  const name = member.member_identity?.full_name ?? "未知"

  return (
    <div>
      <AdminTopBar admin={admin} title={`${name} — 核验`} />
      <div className="p-6">
        <VerificationPanel memberId={id} existing={verification} />
      </div>
    </div>
  )
}
