"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { SubmissionTable } from "./SubmissionTable"
import { RoundStatsPanel } from "./RoundStatsPanel"
import { updateRoundStatus, runRoundMatching } from "@/app/admin/matching/rounds/[id]/actions"
import { Play, Eye, EyeOff } from "lucide-react"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Round = Record<string, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sub = Record<string, any>

interface Stats {
  total: number
  gameTypeDist: { duo: number; multi: number; either: number }
  slotCounts: Record<string, number>
}

interface Props {
  round: Round
  submissions: Sub[]
  stats: Stats
}

export function RoundDetailClient({ round, submissions, stats }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleStatusChange(status: string) {
    setLoading(true)
    setError(null)
    const res = await updateRoundStatus(round.id, status)
    setLoading(false)
    if (res.error) { setError(res.error); return }
    router.refresh()
  }

  async function handleRunMatch() {
    if (submissions.length < 2) { setError("至少需要 2 人提交问卷"); return }
    setLoading(true)
    setError(null)
    const res = await runRoundMatching(round.id, `${round.round_name} 匹配`)
    setLoading(false)
    if (res.error) { setError(res.error); return }
    router.push(`/admin/matching/${res.sessionId}`)
  }

  return (
    <div className="space-y-6">
      {/* 轮次信息 + 操作按钮 */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-lg font-bold">{round.round_name}</h2>
            <StatusBadge status={round.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            问卷: {fmtDate(round.survey_start)} ~ {fmtDate(round.survey_end)}
          </p>
          <p className="text-xs text-muted-foreground">
            活动: {round.activity_start} ~ {round.activity_end}
          </p>
        </div>
        <div className="flex gap-2">
          {round.status === "draft" && (
            <Button size="sm" onClick={() => handleStatusChange("open")} disabled={loading}>
              <Eye className="size-4 mr-1" />开放问卷
            </Button>
          )}
          {round.status === "open" && (
            <Button size="sm" variant="outline" onClick={() => handleStatusChange("closed")} disabled={loading}>
              <EyeOff className="size-4 mr-1" />截止问卷
            </Button>
          )}
          {(round.status === "closed" || round.status === "open") && (
            <Button size="sm" onClick={handleRunMatch} disabled={loading || submissions.length < 2}>
              <Play className="size-4 mr-1" />运行匹配
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* 统计面板 */}
      <RoundStatsPanel stats={stats} activityStart={round.activity_start} activityEnd={round.activity_end} />

      {/* 问卷列表 */}
      <div>
        <h3 className="text-sm font-semibold mb-3">问卷提交 ({submissions.length})</h3>
        <SubmissionTable submissions={submissions} />
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft: { label: "草稿", cls: "bg-muted text-muted-foreground" },
    open: { label: "进行中", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
    closed: { label: "已截止", cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
    matched: { label: "已匹配", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  }
  const s = map[status] ?? map.draft
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${s.cls}`}>{s.label}</span>
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}
