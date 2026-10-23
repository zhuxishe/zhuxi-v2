"use client"

import Link from "next/link"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatAdminDateTime } from "@/lib/admin-datetime"
import { adminAuditReasonIsValid } from "@/lib/member-master/audit-reason"
import { matchingEligibilityReasonLabel, type MatchingRunRecord } from "@/lib/matching/run-lifecycle"

interface Props {
  runs: MatchingRunRecord[]
  loading: boolean
  auditReason: string
  onRefresh: () => void
  onRecover: (run: MatchingRunRecord) => void
  onAbandon: (run: MatchingRunRecord) => void
}

function runStatus(run: MatchingRunRecord) {
  if (run.status === "succeeded") return "已完成"
  if (run.status === "abandoned") return "已作废"
  if (run.status === "failed") return "待恢复"
  return run.lease_expired || run.can_recover ? "状态待确认" : "运行中"
}

function runCountsAvailable(run: MatchingRunRecord) {
  return run.counts_available === true
    && [run.submitted_count, run.eligible_count, run.excluded_count].every((count) => typeof count === "number" && Number.isSafeInteger(count) && count >= 0)
    && run.submitted_count === run.eligible_count! + run.excluded_count!
}

export function MatchingRunRecords({ runs, loading, auditReason, onRefresh, onRecover, onAbandon }: Props) {
  const reasonValid = adminAuditReasonIsValid(auditReason)
  return <section className="rounded-xl border bg-card">
    <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
      <div>
        <h3 className="text-sm font-semibold">本轮运行记录（{runs.length}）</h3>
        <p className="mt-1 text-xs text-muted-foreground">每次主动新增运行保留独立方案；网络重试沿用原运行编号。恢复使用原批输入和原评分版本，不重新读取最新报名、人格权重或互评。</p>
      </div>
      <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading}><RefreshCw className="size-3.5" />刷新状态</Button>
    </header>
    <div className="divide-y">
      {runs.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">尚无运行记录。历史方案仍可在匹配管理中查看。</p>}
      {runs.map((run) => <article key={run.id} className="space-y-2 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">第 {run.batch_number} 批 · {run.session_name}</p>
            <p className="mt-1 break-all text-xs text-muted-foreground">运行编号：{run.id}</p>
            <p className="mt-1 text-xs text-muted-foreground">创建于 {formatAdminDateTime(run.created_at)} · 第 {run.attempt} 次尝试</p>
            {run.algorithm_version && <p className="mt-1 text-xs text-muted-foreground">评分版本：{run.algorithm_version === "max_coverage_split:3" ? "100分基础权重与活动互评" : run.algorithm_version === "max_coverage_split:2" ? "原评分规则" : run.algorithm_version}（{run.algorithm_version} / 适配器 {run.adapter_version ?? "未知"}）</p>}
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{runStatus(run)}</span>
        </div>
        {run.status === "running" && <p className="text-xs text-muted-foreground">{run.lease_expired || run.can_recover ? "运行响应可能中断，尚不能据此判断失败。请先恢复核对，系统会检查是否已经完成。" : "正在处理本批输入和结果，请稍后刷新状态；其他报名仍可继续提交。"}</p>}
        {run.status === "failed" && <p className="text-xs text-muted-foreground">{run.error_message || "本批运行尚未完成。已有输入可恢复；无法恢复时请作废后新增运行。"}</p>}
        {runCountsAvailable(run) ? <div className="space-y-1 text-xs text-muted-foreground">
          <p>本批冻结输入：已保存报名 {run.submitted_count} 人 · 符合资格 {run.eligible_count} 人 · 未通过 {run.excluded_count} 人{run.captured_at ? `（${formatAdminDateTime(run.captured_at)}）` : ""}</p>
          {run.exclusion_summary && run.exclusion_summary.length > 0 && <p>{run.exclusion_summary.map((item) => `${matchingEligibilityReasonLabel(item.reason)} ${item.count} 人`).join("；")}。同一人可能有多项原因，不能将原因人数相加。</p>}
          {run.excluded_count! > 0 && run.exclusion_summary === null && <p>本批排除原因暂不可读取，不能据此推断具体原因。</p>}
        </div> : (run.status === "failed" || run.status === "running") && <p className="text-xs text-muted-foreground">本批资格人数未知：未保存可用计数，不能当作 0 人；当前预览人数不能替代原批输入。</p>}
        {run.session_deleted && <p className="text-xs text-muted-foreground">本批已完成，原方案已被删除；使用原运行编号不会重新生成。</p>}
        {run.session_id && <div className="text-xs">
          <Link href={`/admin/matching/${run.session_id}`} className="text-primary hover:underline">查看方案</Link>
          <span className="ml-2 text-muted-foreground">{run.session_status === "confirmed" ? "已发布" : run.results_ready ? "草稿已完成" : "结果尚未完成，不能发布"}</span>
        </div>}
        {(run.can_recover || run.can_abandon) && (run.status === "failed" || run.status === "running") && <div className="flex flex-wrap gap-2">
          {run.can_recover && <Button size="sm" variant="outline" disabled={loading || !reasonValid} onClick={() => onRecover(run)}>恢复本批</Button>}
          {(run.can_abandon ?? run.can_recover) && <Button size="sm" variant="outline" disabled={loading || !reasonValid} onClick={() => onAbandon(run)}>作废运行</Button>}
        </div>}
      </article>)}
    </div>
  </section>
}
