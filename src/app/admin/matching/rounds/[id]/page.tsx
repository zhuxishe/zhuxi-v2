import { requireAdmin } from "@/lib/auth/admin"
import { fetchRound, fetchRoundSubmissions, fetchRoundStats } from "@/lib/queries/rounds"
import { fetchMemberBriefList } from "@/lib/queries/members"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { RoundDetailClient } from "@/components/admin/RoundDetailClient"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { fetchAdminActivityReviewRoundSummary } from "@/lib/activity-reviews/queries"
import { getRoundPurpose } from "@/lib/matching/round-config"
import { fetchRoundMatchingRuns } from "@/lib/queries/matching-runs"

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

  const [submissions, stats, allMembers, activityReviewSummary, runs] = await Promise.all([
    fetchRoundSubmissions(id),
    fetchRoundStats(id),
    fetchMemberBriefList(),
    getRoundPurpose(round.purpose) === "registration" ? fetchAdminActivityReviewRoundSummary(id) : Promise.resolve(null),
    getRoundPurpose(round.purpose) === "matching" ? fetchRoundMatchingRuns(id) : Promise.resolve([]),
  ])

  return (
    <div>
      <AdminTopBar admin={admin} title="轮次详情" />
      <div className="p-6">
        <Link
          href="/admin/matching"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> 返回匹配管理
        </Link>
        <RoundDetailClient
          key={round.id}
          round={round}
          initialNow={new Date().toISOString()}
          submissions={submissions}
          stats={stats}
          allMembers={allMembers}
          canManageSubmissions={admin.role === "super_admin"}
          canImportMembers={admin.role === "super_admin"}
          activityReviewSummary={activityReviewSummary}
          initialRuns={runs}
        />
      </div>
    </div>
  )
}
