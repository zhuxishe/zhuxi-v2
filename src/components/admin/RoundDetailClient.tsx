"use client"
import { useState, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { RoundStatsPanel } from "./RoundStatsPanel"
import { SubmissionEditDialog } from "./SubmissionEditDialog"
import { RoundImportPanel } from "./RoundImportPanel"
import { canRunRoundMatching } from "./round-detail-rules"
import { runRoundMatching } from "@/app/admin/matching/rounds/[id]/actions"
import { abandonMatchingRun, resumeRoundMatching } from "@/app/admin/matching/rounds/[id]/run-actions"
import { updateRoundStatus } from "@/app/admin/matching/rounds/[id]/status-actions"
import { RoundOpeningDialog } from "./RoundOpeningDialog"
import { useSurveyWindow } from "@/lib/matching/use-survey-window"
import type { RoundRecord } from "@/types"
import { getRoundPurpose, normalizeRoundConfig } from "@/lib/matching/round-config"
import { RoundDetailHeader } from "./round-content/RoundDetailHeader"
import { RoundSubmissionRecords } from "./round-content/RoundSubmissionRecords"
import { RoundActivityReviewSummary } from "./activity-reviews/RoundActivityReviewSummary"
import type { AdminActivityReviewEvent } from "@/lib/activity-reviews/types"
import type { MatchingRunRecord } from "@/lib/matching/run-lifecycle"
import { MatchingRunRecords } from "./MatchingRunRecords"
import { clearMatchingRequestId, matchingRequestId } from "./matching-run-request"
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
  activityReviewSummary?: AdminActivityReviewEvent | null
  initialRuns?: MatchingRunRecord[]
}
export function RoundDetailClient({
  round,
  submissions,
  stats,
  allMembers,
  canManageSubmissions,
  canImportMembers,
  initialNow,
  activityReviewSummary = null,
  initialRuns = [],
}: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [matchingReason, setMatchingReason] = useState("")
  const runRequestId = useRef<string | null>(null)
  const [opening, setOpening] = useState(false)
  const windowState = useSurveyWindow(round, initialNow)
  const [editOpen, setEditOpen] = useState(false)
  const [editSub, setEditSub] = useState<Sub | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const purpose = getRoundPurpose(round.purpose)
  const matching = purpose === "matching"
  const hasRecoverableRuns = initialRuns.some((run) => (run.can_recover || run.can_abandon) && (run.status === "failed" || run.status === "running"))
  const activeCount = submissions.filter((submission) => purpose !== "registration" || !submission.cancelled_at).length
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
      runRequestId.current ??= matchingRequestId(round.id, requestStorage(), () => crypto.randomUUID())
      const res = await runRoundMatching(round.id, `${round.round_name} 匹配`, matchingReason, runRequestId.current)
      if (res.sessionDeleted || res.status === "abandoned") clearRequest(runRequestId.current)
      if (res.error) { setError(res.error); router.refresh(); return }
      if (!res.sessionId) { setError("本批运行状态待确认，请刷新记录后重试；不会另建一批。"); router.refresh(); return }
      clearRequest(runRequestId.current)
      router.push(`/admin/matching/${res.sessionId}`)
    } catch { setError("网络响应中断，运行状态待确认。请刷新记录或再次点击运行匹配，系统会沿用同一编号核对，不会重复新增。"); router.refresh() }
    finally { setLoading(false) }
  }
  function requestStorage() {
    try { return sessionStorage } catch { return null }
  }
  function clearRequest(expectedId: string) {
    clearMatchingRequestId(round.id, requestStorage(), expectedId)
    if (runRequestId.current === expectedId) runRequestId.current = null
  }
  async function handleRecover(run: MatchingRunRecord) {
    setLoading(true)
    setError(null)
    try {
      const res = await resumeRoundMatching(run.id, matchingReason)
      if (res.sessionDeleted) clearRequest(run.id)
      if (res.error) { setError(res.error); router.refresh(); return }
      if (res.sessionId) {
        clearRequest(run.id)
        router.push(`/admin/matching/${res.sessionId}`)
      } else router.refresh()
    } catch { setError("恢复响应中断，状态待确认。请刷新记录后继续核对，不要另建重复运行。"); router.refresh() }
    finally { setLoading(false) }
  }
  async function handleAbandon(run: MatchingRunRecord) {
    if (!confirm(`确定作废第 ${run.batch_number} 批运行？作废后不能继续恢复该运行，之后可新增一批。`)) return
    setLoading(true)
    setError(null)
    try {
      const res = await abandonMatchingRun(run.id, matchingReason)
      if (res.error) { setError(res.error); return }
      clearRequest(run.id)
      router.refresh()
    } catch { setError("作废响应中断，请刷新记录核对实际状态后再操作。") }
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
      <RoundDetailHeader round={round} windowState={windowState} loading={loading} count={activeCount} matchingReason={matchingReason} onOpen={() => setOpening(true)} onClose={() => handleStatusChange("closed")} onMatch={handleRunMatch} />
      {purpose === "registration" ? <RoundActivityReviewSummary roundId={round.id} summary={activityReviewSummary} /> : null}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {opening && <RoundOpeningDialog round={round} onClose={() => setOpening(false)} />}
      {matching && (canRunRoundMatching(round.status, windowState) || hasRecoverableRuns) && (
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
      {matching && <MatchingRunRecords runs={initialRuns} loading={loading} auditReason={matchingReason} onRefresh={() => router.refresh()} onRecover={handleRecover} onAbandon={handleAbandon} />}
      {matching && requiresPlayerAnswers && <p className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">本期包含必填补充问题，请成员自行提交问卷；后台新增与 Excel 导入已暂停，已有问卷仍可编辑。</p>}
      {matching && canImportMembers && !requiresPlayerAnswers ? <RoundImportPanel roundId={round.id} roundStatus={round.status} /> : null}
      {matching && <RoundStatsPanel stats={stats} activityStart={round.activity_start} activityEnd={round.activity_end} />}
      <RoundSubmissionRecords roundName={round.round_name} purpose={purpose} config={config} submissions={submissions} editable={editable} showRaw={canManageSubmissions} onEdit={handleEdit} onCreate={() => setCreateOpen(true)} />
      {matching && canManageSubmissions && editOpen && editSub && <SubmissionEditDialog key={editSub.id} open={editOpen} onOpenChange={setEditOpen} roundId={round.id} mode="edit" submission={editSub} activityStart={round.activity_start} activityEnd={round.activity_end} onSaved={handleSaved} />}
      {matching && canManageSubmissions && <SubmissionEditDialog open={createOpen} onOpenChange={setCreateOpen} roundId={round.id} mode="create" availableMembers={availableMembers} activityStart={round.activity_start} activityEnd={round.activity_end} onSaved={handleSaved} />}
    </div>
  )
}
