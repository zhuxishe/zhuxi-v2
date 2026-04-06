"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createRound } from "@/app/admin/matching/rounds/new/actions"
import { Button } from "@/components/ui/button"

export function RoundCreateForm() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [surveyStart, setSurveyStart] = useState("")
  const [surveyEnd, setSurveyEnd] = useState("")
  const [actStart, setActStart] = useState("")
  const [actEnd, setActEnd] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** 设置活动开始日期时自动填充结束日期（+13天=14天范围） */
  function handleActStartChange(v: string) {
    setActStart(v)
    if (v) {
      const d = new Date(v)
      d.setDate(d.getDate() + 13)
      setActEnd(d.toISOString().split("T")[0])
    }
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    const res = await createRound({
      roundName: name,
      surveyStart,
      surveyEnd,
      activityStart: actStart,
      activityEnd: actEnd,
    })
    setSubmitting(false)
    if (res.error) { setError(res.error); return }
    router.push(`/admin/matching/rounds/${res.roundId}`)
  }

  return (
    <div className="max-w-lg space-y-5">
      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4">
        <h3 className="text-sm font-semibold">轮次信息</h3>
        <div>
          <label className="text-sm font-medium mb-1 block">轮次名称</label>
          <input
            value={name} onChange={(e) => setName(e.target.value)}
            placeholder="例：第3期 双周活动"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
      </div>

      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4">
        <h3 className="text-sm font-semibold">问卷时间</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium mb-1 block">开放时间</label>
            <input type="datetime-local" value={surveyStart}
              onChange={(e) => setSurveyStart(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">截止时间</label>
            <input type="datetime-local" value={surveyEnd}
              onChange={(e) => setSurveyEnd(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4">
        <h3 className="text-sm font-semibold">活动日期（14天）</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium mb-1 block">开始日期</label>
            <input type="date" value={actStart}
              onChange={(e) => handleActStartChange(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">结束日期</label>
            <input type="date" value={actEnd}
              onChange={(e) => setActEnd(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          选择开始日期后自动设置 14 天范围，可手动调整
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-3">
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? "创建中..." : "创建轮次"}
        </Button>
        <Button variant="outline" onClick={() => router.back()}>取消</Button>
      </div>
    </div>
  )
}
