import { notFound } from "next/navigation"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchMatchSession } from "@/lib/queries/matching"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { MatchResultsTable } from "@/components/admin/MatchResultsTable"

interface Props {
  params: Promise<{ id: string }>
}

export default async function MatchSessionDetailPage({ params }: Props) {
  const admin = await requireAdmin()
  const { id } = await params

  let data
  try {
    data = await fetchMatchSession(id)
  } catch {
    notFound()
  }

  const { session, results } = data

  return (
    <div>
      <AdminTopBar admin={admin} title={session.session_name ?? "匹配详情"} />
      <div className="p-6 space-y-4">
        <div className="flex gap-4 text-sm">
          <span className="rounded-full bg-primary/10 text-primary px-3 py-1 font-medium">
            {session.total_candidates} 人参与
          </span>
          <span className="rounded-full bg-green-500/10 text-green-600 px-3 py-1 font-medium">
            {session.total_matched} 人匹配
          </span>
          {session.total_unmatched > 0 && (
            <span className="rounded-full bg-orange-500/10 text-orange-600 px-3 py-1 font-medium">
              {session.total_unmatched} 人未匹配
            </span>
          )}
        </div>
        <MatchResultsTable results={results} />
      </div>
    </div>
  )
}
