"use client"

import { useRef, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { RefreshCw, Users, UserPlus } from "lucide-react"
import { runPoolRematch } from "@/app/admin/matching/[id]/pool-actions"
import { ManualPairDialog } from "./ManualPairDialog"
import { PlayerInfoPopover } from "./PlayerInfoPopover"
import type { SubmissionPrefInfo } from "./match-detail-types"
import type { PoolMember } from "@/lib/queries/pool-members"
import { adminAuditReasonIsValid } from "@/lib/member-master/audit-reason"
import { matchingEligibilityReasonLabel } from "@/lib/matching/run-lifecycle"
import { adjustmentRequestStorage, clearMatchingAdjustmentRequestId, matchingAdjustmentRequestId } from "./matching-adjustment-request"

export type { PoolMember }
export interface AdjustmentPoolSummary {
  submitted_count: number
  eligible_count: number
  excluded_count: number
  exclusion_summary: { reason: string; count: number }[] | null
  has_existing_multi_pool: boolean
}
interface Props {
  sessionId: string
  poolMembers: PoolMember[]
  poolSummary?: AdjustmentPoolSummary
  submissionPrefs?: Record<string, SubmissionPrefInfo>
  auditReason: string
  readOnly?: boolean
  status?: "ready" | "published" | "generating"
  onRefresh: () => void
}

export function RematchPool({ sessionId, poolMembers, poolSummary, submissionPrefs, auditReason, onRefresh, readOnly = false, status = "ready" }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [showManual, setShowManual] = useState(false)
  const submitting = useRef(false)
  const eligibleCount = poolSummary?.eligible_count ?? 0
  const eligibilityKnown = status === "ready" && poolSummary !== undefined
  const canOperate = status === "ready" && eligibilityKnown && !readOnly

  if (eligibilityKnown && poolMembers.length === 0 && !poolSummary?.excluded_count) return <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">取消池为空 — 没有被拆散的配对</div>

  const handleRematch = () => {
    if (submitting.current || eligibleCount < 2 || !canOperate || !adminAuditReasonIsValid(auditReason)) return
    const storage = adjustmentRequestStorage()
    const operationId = matchingAdjustmentRequestId(sessionId, "pool", [], storage, () => crypto.randomUUID())
    submitting.current = true
    startTransition(async () => {
      setError("")
      setSuccess("")
      try {
        const res = await runPoolRematch(sessionId, auditReason, operationId)
        if (res.error) setError(res.error)
        else {
          clearMatchingAdjustmentRequestId(sessionId, "pool", [], storage, operationId)
          setSuccess(`本次已处理，生成 ${res.matchCount ?? 0} 组新匹配；未匹配者及原因请查看下方诊断。`)
          onRefresh()
        }
      } catch {
        setError("再匹配结果待确认，请刷新操作记录或沿用同一编号重试")
      } finally {
        submitting.current = false
      }
    })
  }
  const handlePaired = () => { setShowManual(false); onRefresh() }
  const dialogMembers = poolMembers.filter((member) => member.eligible !== false).map((member) => ({ id: member.id, name: member.name }))

  return <div className="rounded-lg border bg-orange-50/50 p-4 space-y-3">
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-semibold flex items-center gap-1.5"><Users className="size-4 text-orange-600" />再匹配池{status === "ready" && `（${eligibilityKnown ? `${eligibleCount} 人` : "资格待确认"}）`}</h3>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setShowManual(true)} disabled={!canOperate || isPending || eligibleCount < 2 || !adminAuditReasonIsValid(auditReason)}><UserPlus className="size-3.5" /> 手动配对</Button>
        <Button size="sm" onClick={handleRematch} disabled={!canOperate || isPending || eligibleCount < 2 || !adminAuditReasonIsValid(auditReason)}><RefreshCw className={`size-3.5 ${isPending ? "animate-spin" : ""}`} />运行再匹配</Button>
      </div>
    </div>
    {status === "published" && <p className="text-xs text-muted-foreground">结果已发布。如需重新配对，请先撤回发布。</p>}
    {status === "generating" && <p className="text-xs text-muted-foreground">匹配结果生成后，可处理待重新匹配的成员。</p>}
    {status === "ready" && <p className="text-xs text-muted-foreground">仅处理本方案取消后尚未重新匹配的成员；不自动加入原未匹配者、后来报名者或其他方案人员。确认运行时将重新核验资格。</p>}
    {status === "ready" && !eligibilityKnown && <p className="text-xs text-amber-700">取消池资格人数暂不可读取，请稍后刷新重试；当前不能开始新操作。</p>}
    {eligibilityKnown && poolSummary && <div className="space-y-1 text-xs text-muted-foreground">
      <p>本方案取消待配 {poolSummary.submitted_count} 人 · 符合资格 {poolSummary.eligible_count} 人 · 未通过 {poolSummary.excluded_count} 人。</p>
      {poolSummary.exclusion_summary === null && <p>已保护个人资料，详细原因不可用。</p>}
      {poolSummary.exclusion_summary && poolSummary.exclusion_summary.length > 0 && <p>{poolSummary.exclusion_summary.map((item) => `${matchingEligibilityReasonLabel(item.reason)} ${item.count} 人`).join("；")}。同一人可能有多个原因。</p>}
      {poolSummary.excluded_count > 0 && <p>未通过资格者保留原记录，本次不参与计算。</p>}
      {poolSummary.has_existing_multi_pool && <p>本方案已有有效多人池，本次不会修改原池或新增第二池；部分多人可能继续待配。需要扩大时请先明确拆分原池。</p>}
    </div>}
    {eligibilityKnown && <div className="flex flex-wrap gap-1.5">{poolMembers.map((member) => <span key={member.id} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${member.eligible === false ? "bg-muted text-muted-foreground" : "bg-orange-100 text-orange-800"}`}><PlayerInfoPopover member={member.memberData} submissionPrefs={submissionPrefs}>{member.name}</PlayerInfoPopover>{member.eligible === false && <span>（本次不参与：{member.exclusionReasons?.map(matchingEligibilityReasonLabel).join("、") || "资格未通过"}）</span>}</span>)}</div>}
    {eligibilityKnown && eligibleCount < 2 && <p className="text-xs text-muted-foreground">符合资格的成员不足 2 人，暂不能运行。</p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {success && <p role="status" className="text-sm text-green-600">{success}</p>}
    {canOperate && <ManualPairDialog open={showManual} onOpenChange={setShowManual} sessionId={sessionId} poolMembers={dialogMembers} auditReason={auditReason} hasActiveMultiPool={poolSummary?.has_existing_multi_pool} onPaired={handlePaired} />}
  </div>
}
