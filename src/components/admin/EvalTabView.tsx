"use client"

import { useState } from "react"
import { EVAL_DIMENSIONS } from "@/lib/constants/interview"

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props { evaluations: any[] }

function calcAverage(evals: any[]) {
  if (!evals.length) return null
  const avg: Record<string, number> = {}
  for (const dim of EVAL_DIMENSIONS) {
    const sum = evals.reduce((s, e) => s + (Number(e[dim.key]) || 0), 0)
    avg[dim.key] = Math.round((sum / evals.length) * 10) / 10
  }
  avg.attractiveness_score = Math.round(
    (evals.reduce((s, e) => s + (Number(e.attractiveness_score) || 0), 0) / evals.length) * 10
  ) / 10
  return avg
}

function ScoreBar({ label, value, max = 5 }: { label: string; value?: number; max?: number }) {
  const v = value ?? 0
  const pct = ((v - 1) / (max - 1)) * 100
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-20 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium w-6 text-right">{v}</span>
    </div>
  )
}

export function EvalTabView({ evaluations }: Props) {
  const [activeIdx, setActiveIdx] = useState(0) // last = average

  if (!evaluations.length) return <p className="text-sm text-muted-foreground">未评估</p>

  const avg = calcAverage(evaluations)
  const tabs = [
    ...evaluations.map((e) => ({
      id: e.interviewer_id,
      label: e.interviewer_name ?? "未知面试官",
      data: e,
    })),
    { id: "average", label: "平均值", data: avg },
  ]
  const current = tabs[activeIdx]?.data

  return (
    <div className="space-y-3">
      {/* Tab 切换 */}
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((tab, i) => (
          <button key={tab.id} type="button" onClick={() => setActiveIdx(i)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
              activeIdx === i
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-border hover:bg-muted"
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* 面试官信息 */}
      {activeIdx < evaluations.length && (
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>日期: {evaluations[activeIdx]?.created_at?.split("T")[0] ?? "-"}</span>
          {evaluations[activeIdx]?.risk_level && (
            <span>风险: {evaluations[activeIdx].risk_level}</span>
          )}
        </div>
      )}

      {/* 17 维度 */}
      <div className="space-y-2">
        {EVAL_DIMENSIONS.map((dim) => (
          <ScoreBar key={dim.key} label={dim.label} value={current?.[dim.key]} />
        ))}
        <ScoreBar label="颜值" value={current?.attractiveness_score} />
      </div>

      {/* 备注 */}
      {activeIdx < evaluations.length && (
        <>
          {current?.risk_notes && (
            <p className="text-xs text-muted-foreground">风险备注: {current.risk_notes}</p>
          )}
          {current?.interviewer_notes && (
            <p className="text-xs text-muted-foreground">面试备注: {current.interviewer_notes}</p>
          )}
        </>
      )}
    </div>
  )
}
