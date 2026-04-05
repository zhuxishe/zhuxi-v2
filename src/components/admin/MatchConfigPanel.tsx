"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { runMatching } from "@/app/admin/matching/new/actions"
import { Button } from "@/components/ui/button"
import { Users } from "lucide-react"

interface Props {
  adminId: string
  candidateCount: number
}

export function MatchConfigPanel({ adminId: _adminId, candidateCount }: Props) {
  const router = useRouter()
  const [sessionName, setSessionName] = useState("")
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRun() {
    setRunning(true)
    setError(null)
    const result = await runMatching({ sessionName })
    setRunning(false)
    if (result.error) {
      setError(result.error)
    } else if (result.sessionId) {
      router.push(`/admin/matching/${result.sessionId}`)
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4">
        <h3 className="text-sm font-semibold">匹配设置</h3>

        <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-4 py-3">
          <Users className="size-5 text-primary" />
          <div>
            <p className="text-sm font-medium">{candidateCount} 名候选人</p>
            <p className="text-xs text-muted-foreground">已批准的成员将自动参与匹配</p>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">批次名称</label>
          <input
            type="text"
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            placeholder={`匹配 ${new Date().toLocaleDateString("zh-CN")}`}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary transition-colors"
          />
        </div>

        <div className="rounded-lg bg-muted/30 px-4 py-3 text-xs text-muted-foreground space-y-1">
          <p>算法: 优化贪心 + 增广路径 + 2-opt</p>
          <p>评分: 7因子加权 (兴趣20 + 社交互补15 + 跨校15 + 合拍分15 + 重复衰减15 + 玩法10 + 等级10)</p>
          <p>约束: 性别偏好 + 黑名单 + 冷却期</p>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button onClick={handleRun} disabled={running || candidateCount < 2}>
          {running ? "匹配中..." : "开始匹配"}
        </Button>
        <Button variant="outline" onClick={() => router.back()}>取消</Button>
      </div>
    </div>
  )
}
