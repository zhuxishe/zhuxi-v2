"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { COMPOSITE_SCORE_FIELDS, compositeScoreFormValues } from "@/lib/member-master/composite-scores"
import { saveMemberCompositeScores } from "@/app/admin/members/[id]/interview/composite-score-actions"
import type { MemberCompositeScores, MemberCompositeScoreValues } from "@/types/member-composite-scores"
import { ScoreSlider } from "./ScoreSlider"

export function MemberCompositeScoreEditor({ initial }: { initial: MemberCompositeScores }) {
  const router = useRouter()
  const [saved, setSaved] = useState(initial)
  const [scores, setScores] = useState(() => compositeScoreFormValues(initial))
  const [reason, setReason] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  function changeScore(key: keyof MemberCompositeScoreValues, value: number) {
    setScores((current) => ({ ...current, [key]: value }))
    setMessage(null)
  }

  async function saveScores() {
    setPending(true)
    setError(null)
    setMessage(null)
    try {
      const result = await saveMemberCompositeScores(initial.member_id, scores, saved.updated_at, reason)
      if (result.error) {
        setError(result.error)
      } else if (result.scores) {
        setSaved(result.scores)
        setScores(compositeScoreFormValues(result.scores))
        setReason("")
        setMessage("综合评分已保存")
        router.refresh()
      }
    } catch {
      setError("保存未完成，请刷新核对后重试")
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4" aria-label="综合评分">
      <div>
        <h3 className="text-sm font-semibold">综合评分</h3>
        <p className="mt-1 text-xs text-muted-foreground">仅管理员可见，所有管理员共同维护同一组评分。</p>
      </div>
      <fieldset disabled={pending} className="space-y-4">
        {COMPOSITE_SCORE_FIELDS.map(({ key, label, description }) => (
          <div key={key}>
            <ScoreSlider label={label} description={description} value={scores[key]} onChange={(value) => changeScore(key, value)} />
            {saved[key] === null ? <p className="mt-1 text-xs text-muted-foreground">{scores[key] === 3 ? "未评分，默认显示 3 分" : "尚未保存评分"}</p> : null}
          </div>
        ))}
        <p className="text-xs text-muted-foreground">点击“保存综合评分”后，将记录当前四项分数。</p>
        <label className="block">
          <span className="text-sm font-medium">综合评分保存原因（必填）</span>
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={2}
            placeholder="请说明本次评分依据"
            className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
        </label>
        <Button type="button" onClick={saveScores} disabled={pending || reason.trim().length < 4}>
          {pending ? "保存中..." : "保存综合评分"}
        </Button>
      </fieldset>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {message ? <p role="status" className="text-sm text-primary">{message}</p> : null}
    </section>
  )
}
