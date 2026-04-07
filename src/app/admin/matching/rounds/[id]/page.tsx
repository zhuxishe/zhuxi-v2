import { requireAdmin } from "@/lib/auth/admin"
import { fetchRound, fetchRoundSubmissions, fetchRoundStats } from "@/lib/queries/rounds"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { RoundDetailClient } from "@/components/admin/RoundDetailClient"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

interface Props {
  params: Promise<{ id: string }>
}

export default async function RoundDetailPage({ params }: Props) {
  const { id } = await params
  const admin = await requireAdmin()

  let round
  try {
    round = await fetchRound(id)
  } catch {
    notFound()
  }

  const [submissions, stats] = await Promise.all([
    fetchRoundSubmissions(id),
    fetchRoundStats(id),
  ])

  return (
    <div>
      <AdminTopBar admin={admin} title="轮次详情" />
      <div className="p-6">
        <Link
          href="/admin/matching/rounds"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> 返回轮次列表
        </Link>
        <RoundDetailClient round={round} submissions={submissions} stats={stats} />
      </div>
    </div>
  )
}
