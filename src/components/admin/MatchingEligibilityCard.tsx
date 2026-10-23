import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatAdminDateTime } from "@/lib/admin-datetime"
import { matchingEligibilityReasonLabel, type MatchingEligibilitySummary } from "@/lib/matching/run-lifecycle"

interface Props {
  summary: MatchingEligibilitySummary | null
  error?: string | null
  loading: boolean
  onRefresh: () => void
}

export function MatchingEligibilityCard({ summary, error = null, loading, onRefresh }: Props) {
  return <section className="rounded-xl border bg-card" aria-label="运行前资格人数">
    <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
      <h3 className="text-sm font-semibold">运行前资格人数</h3>
      <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading}><RefreshCw className="size-3.5" />刷新资格</Button>
    </header>
    <div className="space-y-2 px-4 py-3 text-sm">
      {summary ? <>
        <p>已保存报名 <strong>{summary.submitted_count}</strong> 人 · 符合资格 <strong>{summary.eligible_count}</strong> 人 · 未通过 <strong>{summary.excluded_count}</strong> 人</p>
        {summary.exclusion_summary.length > 0 && <p className="text-xs text-muted-foreground">{summary.exclusion_summary.map((item) => `${matchingEligibilityReasonLabel(item.reason)} ${item.count} 人`).join("；")}。同一人可能有多项原因，不能将原因人数相加。</p>}
        {summary.eligible_count < 2 && <p className="text-xs text-muted-foreground">当前符合资格不足 2 人，无法新增运行；原报名保留。已有批次仍按原输入处理。</p>}
        <p className="text-xs text-muted-foreground">核对时间：{formatAdminDateTime(summary.checked_at)}。这是当前预览；实际运行会重新核对并冻结当批输入，收集报名继续进行。</p>
      </> : <p className="text-sm text-destructive" role="status">{error || "资格人数暂未读取，不能据此判断是否有人符合资格。请刷新后重试。"}</p>}
    </div>
  </section>
}
