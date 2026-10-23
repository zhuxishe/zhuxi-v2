"use client"

import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatAdminDateTime } from "@/lib/admin-datetime"
import { adminAuditReasonIsValid } from "@/lib/member-master/audit-reason"
import { matchingEligibilityReasonLabel } from "@/lib/matching/run-lifecycle"
import { MATCHING_ADJUSTMENT_ERRORS, type MatchingAdjustmentRecord } from "@/lib/matching/adjustment-types"

interface Props {
  records: MatchingAdjustmentRecord[]
  unavailable: boolean
  loading: boolean
  readOnly: boolean
  auditReason: string
  onRefresh: () => void
  onRecover: (record: MatchingAdjustmentRecord) => void
  onNewOperation: (record: MatchingAdjustmentRecord) => void
}
const KIND_LABELS = { manual: "人工配对", pool: "取消池再匹配", split: "拆分配对", restore: "恢复配对" }

export function MatchingAdjustmentRecords({ records, unavailable, loading, readOnly, auditReason, onRefresh, onRecover, onNewOperation }: Props) {
  return <section className="rounded-xl border bg-card">
    <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
      <div><h3 className="text-sm font-semibold">方案调整记录（{records.length}）</h3><p className="mt-1 text-xs text-muted-foreground">每次调整保留独立操作编号和输入。失败或响应中断时先核对原编号；恢复沿用原输入，不重新读取最新问卷、人格权重或互评。新人工选择会在确认时重新核验。</p></div>
      <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading}><RefreshCw className="size-3.5" />刷新调整记录</Button>
    </header>
    {unavailable ? <p role="alert" className="px-4 py-3 text-sm text-amber-700">调整记录暂不可读取，请刷新后重试；不能据此判断上一操作是否完成。</p> : <div className="divide-y">
      {records.length === 0 && <p className="px-4 py-4 text-sm text-muted-foreground">尚无新调整记录。旧结果保持原有人员、时间和分数。</p>}
      {records.map((record) => <article key={record.id} className="space-y-2 px-4 py-3">
        <div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-medium">{KIND_LABELS[record.kind]} · 第 {record.attempt} 次尝试</p><span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{record.status === "succeeded" ? "已完成" : record.status === "failed" ? "未完成" : "结果待确认"}</span></div>
        <p className="break-all text-xs text-muted-foreground">操作编号：{record.id}</p>
        <p className="text-xs text-muted-foreground">创建于 {formatAdminDateTime(record.created_at)}</p>
        {record.captured_at ? <div className="space-y-1 text-xs text-muted-foreground">
          <p>本次冻结范围 {record.submitted_count} 人 · 符合资格 {record.eligible_count} 人 · 未通过 {record.excluded_count} 人（{formatAdminDateTime(record.captured_at)}）</p>
          {record.exclusion_summary === null && <p>已保护个人资料，详细原因不可用。</p>}
          {record.exclusion_summary && record.exclusion_summary.length > 0 && <p>{record.exclusion_summary.map((item) => `${matchingEligibilityReasonLabel(item.reason)} ${item.count} 人`).join("；")}。同一人可有多项原因。</p>}
        </div> : <p className="text-xs text-muted-foreground">本次资格人数尚未保存，不能当作 0 人。</p>}
        {record.status !== "succeeded" && <p className="text-xs text-muted-foreground">{record.error_code ? MATCHING_ADJUSTMENT_ERRORS[record.error_code] ?? MATCHING_ADJUSTMENT_ERRORS.UNKNOWN : "操作仍在处理中或响应中断，请先刷新核对。"}</p>}
        {record.has_existing_multi_pool && record.kind === "pool" && <p className="text-xs text-muted-foreground">本次保留已有多人池，不新增第二池；不符合双人分流的成员可能继续待配。</p>}
        {record.status === "failed" && !record.can_recover && !readOnly && <div className="space-y-1"><p className="text-xs text-muted-foreground">本编号不能继续恢复。可明确结束本地重试，重新核验后开始新操作；原记录保留。</p><Button size="sm" variant="outline" disabled={loading} onClick={() => onNewOperation(record)}>重新检查并开始新操作</Button></div>}
        {record.can_recover && record.status !== "succeeded" && !readOnly && <Button size="sm" variant="outline" disabled={loading || !adminAuditReasonIsValid(auditReason)} onClick={() => onRecover(record)}>沿原输入恢复</Button>}
      </article>)}
    </div>}
  </section>
}
