import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchRound, fetchRoundSubmissions, fetchRoundHasSession } from "@/lib/queries/rounds"
import { getRoundPurpose, normalizeRoundConfig, ROUND_SETUP_ERROR } from "@/lib/matching/round-config"
import { formatTokyoDateTimeLocal } from "@/lib/player-activity/tokyo-datetime"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { RoundContentEditor } from "@/components/admin/round-content/RoundContentEditor"

export default async function RoundEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = await requireAdmin()
  const round = await fetchRound(id).catch(() => null)
  if (!round) notFound()
  const supported = "purpose" in round && "content_config" in round && "config_revision" in round
  const [submissions, hasSession] = supported ? await Promise.all([fetchRoundSubmissions(id), fetchRoundHasSession(id)]) : [[], false]
  const initial = {
    roundName: round.round_name, purpose: getRoundPurpose(round.purpose),
    surveyStart: formatTokyoDateTimeLocal(round.survey_start), surveyEnd: formatTokyoDateTimeLocal(round.survey_end),
    activityStart: round.activity_start, activityEnd: round.activity_end,
    contentConfig: normalizeRoundConfig(round.content_config),
  }
  return <div>
    <AdminTopBar admin={admin} title="内容与问卷编辑" />
    <div className="space-y-5 p-4 sm:p-6">
      <Link href={`/admin/matching/rounds/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="size-4" />返回轮次详情</Link>
      {supported ? <RoundContentEditor key={id} roundId={id} initial={initial} revision={round.config_revision} locked={submissions.length > 0 || hasSession || round.status === "matched"} status={round.status} canDelete={admin.role === "super_admin"} hasMatches={hasSession} /> : <p role="alert" className="rounded-xl border bg-card p-5 text-sm">{ROUND_SETUP_ERROR}</p>}
    </div>
  </div>
}
