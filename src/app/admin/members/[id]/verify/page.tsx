import { notFound } from "next/navigation"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchMemberDetail } from "@/lib/queries/members"
import { fetchMemberVerification } from "@/lib/queries/activities"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { VerificationPanel } from "@/components/admin/VerificationPanel"

interface Props {
  params: Promise<{ id: string }>
}

export default async function MemberVerifyPage({ params }: Props) {
  const admin = await requireAdmin()
  const { id } = await params

  let member
  try { member = await fetchMemberDetail(id) } catch { notFound() }

  const verification = await fetchMemberVerification(id)
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
