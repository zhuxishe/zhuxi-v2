"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { InterviewEvalFormData, RiskLevel } from "@/types"
import { EVAL_DIMENSIONS, RISK_LEVEL_OPTIONS } from "@/lib/constants/interview"
import { submitInterviewEval } from "@/app/admin/members/[id]/interview/actions"
import { Button } from "@/components/ui/button"
import { ScoreSlider } from "./ScoreSlider"

interface Props {
  memberId: string
  memberName: string
  adminName: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  existing?: any
}

function buildInitial(existing?: Record<string, unknown>): InterviewEvalFormData {
  const defaults: InterviewEvalFormData = {
    communication: 3, articulation: 3, enthusiasm: 3, sincerity: 3,
    social_comfort: 3, humor: 3, emotional_stability: 3, boundary_respect: 3,
    team_orientation: 3, interest_alignment: 3, japanese_ability: 3,
    time_commitment: 3, leadership_potential: 3, openness: 3,
    responsibility: 3, first_impression: 3, overall_recommendation: 3,
    risk_level: "low", risk_notes: "", interviewer_notes: "",
    attractiveness_score: 3,
  }
  if (!existing) return defaults
  return { ...defaults, ...existing } as InterviewEvalFormData
}

export function InterviewEvalForm({ memberId, memberName, adminName, existing }: Props) {
  const router = useRouter()
  const [data, setData] = useState(() => buildInitial(existing))
  const [interviewDate, setInterviewDate] = useState(
    existing?.created_at?.split("T")[0] ?? new Date().toISOString().split("T")[0]
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setField<K extends keyof InterviewEvalFormData>(key: K, val: InterviewEvalFormData[K]) {
    setData((prev) => ({ ...prev, [key]: val }))
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    const result = await submitInterviewEval(memberId, data, interviewDate)
    setSubmitting(false)
    if (result.error) setError(result.error)
    else router.push(`/admin/members/${memberId}`)
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-3">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-muted-foreground">评估对象</label>
            <p className="text-sm font-medium mt-1">{memberName}</p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">面试官</label>
            <p className="text-sm font-medium mt-1">{adminName}</p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">面试日期</label>
            <input type="date" value={interviewDate}
              onChange={(e) => setInterviewDate(e.target.value)}
              className="w-full mt-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary" />
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4">
        <h3 className="text-sm font-semibold">17 维度评分 (1-5)</h3>
        {EVAL_DIMENSIONS.map((dim) => (
          <ScoreSlider
            key={dim.key}
            label={dim.label}
            description={dim.description}
            value={data[dim.key as keyof InterviewEvalFormData] as number}
            onChange={(v) => setField(dim.key as keyof InterviewEvalFormData, v)}
          />
        ))}
      </div>

      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4">
        <h3 className="text-sm font-semibold">颜值评分</h3>
        <ScoreSlider label="颜值" description="外貌整体印象" value={data.attractiveness_score} onChange={(v) => setField("attractiveness_score", v)} />
      </div>

      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4">
        <h3 className="text-sm font-semibold">风险评估</h3>
        <div className="flex gap-2">
          {RISK_LEVEL_OPTIONS.map((opt) => (
            <button key={opt.value} type="button" onClick={() => setField("risk_level", opt.value as RiskLevel)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${data.risk_level === opt.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >{opt.label}</button>
          ))}
        </div>
        <textarea className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" rows={2} placeholder="风险备注（可选）" value={data.risk_notes} onChange={(e) => setField("risk_notes", e.target.value)} />
      </div>

      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <h3 className="text-sm font-semibold mb-3">面试官备注</h3>
        <textarea className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" rows={3} placeholder="其他观察和备注..." value={data.interviewer_notes} onChange={(e) => setField("interviewer_notes", e.target.value)} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-3">
        <Button onClick={handleSubmit} disabled={submitting}>{submitting ? "保存中..." : "保存评估"}</Button>
        <Button variant="outline" onClick={() => router.back()}>取消</Button>
      </div>
    </div>
  )
}
