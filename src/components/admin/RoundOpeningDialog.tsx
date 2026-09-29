"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { updateRoundStatus } from "@/app/admin/matching/rounds/[id]/status-actions"
import { formatTokyoDateTimeLocal } from "@/lib/player-activity/tokyo-datetime"
import { formatSurveyTime, type SurveyWindow } from "@/lib/matching/survey-window"
import { getRoundPurpose } from "@/lib/matching/round-config"

interface Props {
  round: SurveyWindow & { id: string; purpose?: string }
  onClose: () => void
}

export function RoundOpeningDialog({ round, onClose }: Props) {
  const router = useRouter()
  const reopening = round.status !== "draft"
  const [surveyStart, setStart] = useState(() => formatTokyoDateTimeLocal(reopening ? new Date().toISOString() : round.survey_start))
  const [surveyEnd, setEnd] = useState(() => formatTokyoDateTimeLocal(round.survey_end))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const purpose = getRoundPurpose(round.purpose)
  const subject = purpose === "matching" ? "问卷" : purpose === "registration" ? "报名" : "展示"
  const title = `${reopening ? "重新开放" : "开放"}${subject}`

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)
    try {
      const result = await updateRoundStatus(round.id, "open", { surveyStart, surveyEnd })
      if (result.error) { setError(result.error); return }
      onClose()
      router.refresh()
    } catch {
      setError("网络异常，请重试；已有记录不会被清空")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose() }}>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{purpose === "announcement" ? "请确认通知的展示时间（日本时间）。通知无需玩家提交。" : `请确认${subject}收集时间（日本时间）。已有提交会保留；开放期间，玩家可以提交或修改自己的内容。`}</DialogDescription>
        <p className="text-xs text-muted-foreground">原截止时间：{formatSurveyTime(round.survey_end)}</p>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm">开放时间（日本时间）
            <input type="datetime-local" required value={surveyStart} onChange={(event) => setStart(event.target.value)} disabled={pending} className="mt-1 w-full rounded-md border bg-background px-3 py-2" />
          </label>
          <label className="block text-sm">截止时间（日本时间）
            <input type="datetime-local" required value={surveyEnd} onChange={(event) => setEnd(event.target.value)} disabled={pending} className="mt-1 w-full rounded-md border bg-background px-3 py-2" />
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>取消</Button>
            <Button type="submit" disabled={pending}>{pending ? "保存中…" : title}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
