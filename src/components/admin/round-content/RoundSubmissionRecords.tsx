"use client"

import { Download, Plus } from "lucide-react"
import type { RoundContentConfig, RoundPurpose } from "@/types"
import { Button } from "@/components/ui/button"
import { SubmissionTable } from "../SubmissionTable"
import { RoundAnswerList } from "./RoundAnswerList"
import { buildRoundSubmissionCsv } from "@/lib/matching/round-submission-export"

interface Props {
  roundName: string; purpose: RoundPurpose; config: RoundContentConfig
  submissions: Record<string, any>[]; editable: boolean; showRaw: boolean
  onEdit: (submission: Record<string, any>) => void; onCreate: () => void
}

export function RoundSubmissionRecords({ roundName, purpose, config, submissions, editable, showRaw, onEdit, onCreate }: Props) {
  if (purpose === "announcement") return <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">本期仅发布活动通知，不收集报名或问卷。</p>
  function download() {
    const url = URL.createObjectURL(new Blob([buildRoundSubmissionCsv(submissions, config, purpose)], { type: "text/csv;charset=utf-8" }))
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `${roundName.replace(/[\\/:*?"<>|]/g, "-")}-提交记录.csv`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <section className="relative z-0 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-sm font-semibold">{purpose === "registration" ? "报名名单" : "问卷提交"}（{submissions.length}）</h3>
      <div className="flex gap-2">
        {showRaw && <Button size="sm" variant="outline" disabled={!submissions.length} onClick={download}><Download className="mr-1 size-4" />导出 CSV</Button>}
        {purpose === "matching" && editable && !config.questions.some((question) => question.required) && <Button size="sm" variant="outline" onClick={onCreate}><Plus className="mr-1 size-4" />新增问卷</Button>}
      </div>
    </div>
    {submissions.length >= 500 && <p className="text-xs text-amber-700">当前展示并导出最近 500 条提交。</p>}
    {purpose === "matching" ? <SubmissionTable submissions={submissions} onEdit={onEdit} editable={editable} showRaw={showRaw} /> : <RoundAnswerList submissions={submissions} config={config} showRaw={showRaw} />}
    {purpose === "matching" && config.questions.length > 0 && <div className="space-y-3"><h4 className="text-sm font-semibold">补充问题回答</h4><RoundAnswerList submissions={submissions} config={config} showRaw={showRaw} /></div>}
  </section>
}
