import { requireAdmin } from "@/lib/auth/admin"
import { fetchMatchCandidates } from "@/lib/queries/matching"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { MatchConfigPanel } from "@/components/admin/MatchConfigPanel"

export default async function NewMatchPage() {
  const admin = await requireAdmin()
  const candidates = await fetchMatchCandidates()

  return (
    <div>
      <AdminTopBar admin={admin} title="新建匹配（测试用）" />
      <div className="p-6">
        <MatchConfigPanel
          adminId={admin.id}
          candidateCount={candidates.length}
        />
      </div>
    </div>
  )
}
