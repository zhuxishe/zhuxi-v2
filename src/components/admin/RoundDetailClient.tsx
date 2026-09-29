"use client"
import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { RoundStatsPanel } from "./RoundStatsPanel"
import { SubmissionEditDialog } from "./SubmissionEditDialog"
import { RoundImportPanel } from "./RoundImportPanel"
import { canRunRoundMatching } from "./round-detail-rules"
import { runRoundMatching } from "@/app/admin/matching/rounds/[id]/actions"
import { updateRoundStatus } from "@/app/admin/matching/rounds/[id]/status-actions"
import { RoundOpeningDialog } from "./RoundOpeningDialog"
import { useSurveyWindow } from "@/lib/matching/use-survey-window"
import type { RoundRecord } from "@/types"
import { getRoundPurpose, normalizeRoundConfig } from "@/lib/matching/round-config"
import { RoundDetailHeader } from "./round-content/RoundDetailHeader"
import { RoundSubmissionRecords } from "./round-content/RoundSubmissionRecords"
type Sub = Record<string, any>
interface Stats {
  total: number
  gameTypeDist: { duo: number; multi: number; either: number }
  slotCounts: Record<string, number>
}
interface Props {
  round: RoundRecord
  submissions: Sub[]
  stats: Stats
  allMembers: { id: string; name: string }[]
  canManageSubmissions: boolean
  canImportMembers: boolean
  initialNow: string
}
export function RoundDetailClient({
  round,
  submissions,
  stats,
  allMembers,
  canManageSubmissions,
  canImportMembers,
  initialNow,
}: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [matchingReason, setMatchingReason] = useState("")
  const [opening, setOpening] = useState(false)
  const windowState = useSurveyWindow(round, initialNow)
  const [editOpen, setEditOpen] = useState(false)
  const [editSub, setEditSub] = useState<Sub | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const purpose = getRoundPurpose(round.purpose)
  const matching = purpose === "matching"
  const config = normalizeRoundConfig(round.content_config)
  const requiresPlayerAnswers = config.questions.some((question) => question.required)
  const editable = canManageSubmissions && round.status !== "matched" && matching
  const availableMembers = useMemo(() => {
    const submitted = new Set(submissions.map((s) => s.member_id))
    return allMembers.filter((m) => !submitted.has(m.id))
  }, [allMembers, submissions])
  async function handleStatusChange(status: string) {
    setLoading(true)
    setError(null)
    try {
      const res = await updateRoundStatus(round.id, status)
      if (res.error) { setError(res.error); return }
      router.refresh()
    } catch {
      setError("网络异常，请稍后重试")
    } finally {
      setLoading(false)
    }
  }
  async function handleRunMatch() {
    if (submissions.length < 2) { setError("至少需要 2 人提交问卷"); return }
    setLoading(true)
    setError(null)
    try {
      const res = await runRoundMatching(round.id, `${round.round_name} 匹配`, matchingReason)
      if (res.error) { setError(res.error); return }
      router.push(`/admin/matching/${res.sessionId}`)
    } catch { setError("运行失败，请稍后重试") }
    finally { setLoading(false) }
  }
  function handleEdit(sub: Sub) {
    setEditSub(sub)
    setEditOpen(true)
  }
  function handleSaved() {
    router.refresh()
  }
  return (
    <div className="space-y-6">
      <RoundDetailHeader round={round} windowState={windowState} loading={loading} count={submissions.length} matchingReason={matchingReason} onOpen={() => setOpening(true)} onClose={() => handleStatusChange("closed")} onMatch={handleRunMatch} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {opening && <RoundOpeningDialog round={round} onClose={() => setOpening(false)} />}
      {matching && canRunRoundMatching(round.status) && (
        <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
          <label htmlFor="round-matching-reason" className="text-sm font-medium">
            运行匹配理由
          </label>
          <input
            id="round-matching-reason"
            value={matchingReason}
            onChange={(event) => setMatchingReason(event.target.value)}
            minLength={4}
            maxLength={500}
            placeholder="必填，4–500 字；写入本轮每位成员的匹配审计记录"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>
      )}
      {matching && requiresPlayerAnswers && <p className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">本期包含必填补充问题，请成员自行提交问卷；后台新增与 Excel 导入已暂停，已有问卷仍可编辑。</p>}
      {matching && canImportMembers && !requiresPlayerAnswers ? <RoundImportPanel roundId={round.id} roundStatus={round.status} /> : null}
      {matching && <RoundStatsPanel stats={stats} activityStart={round.activity_start} activityEnd={round.activity_end} />}
      <RoundSubmissionRecords roundName={round.round_name} purpose={purpose} config={config} submissions={submissions} editable={editable} showRaw={canManageSubmissions} onEdit={handleEdit} onCreate={() => setCreateOpen(true)} />
      {matching && canManageSubmissions && editSub && <SubmissionEditDialog key={editSub.id} open={editOpen} onOpenChange={setEditOpen} roundId={round.id} mode="edit" submission={editSub} activityStart={round.activity_start} activityEnd={round.activity_end} onSaved={handleSaved} />}
      {matching && canManageSubmissions && <SubmissionEditDialog open={createOpen} onOpenChange={setCreateOpen} roundId={round.id} mode="create" availableMembers={availableMembers} activityStart={round.activity_start} activityEnd={round.activity_end} onSaved={handleSaved} />}
    </div>
  )
}
