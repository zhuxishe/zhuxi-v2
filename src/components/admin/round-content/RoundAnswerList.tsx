"use client"

import type { RoundContentConfig } from "@/types"
import { customAnswerText, submissionIdentity } from "@/lib/matching/round-submission-export"
import { formatSurveyTime } from "@/lib/matching/survey-window"

export function RoundAnswerList({ submissions, config, showRaw }: { submissions: Record<string, any>[]; config: RoundContentConfig; showRaw: boolean }) {
  if (!submissions.length) return <p className="py-6 text-center text-sm text-muted-foreground">暂无提交记录</p>
  return <div className="space-y-3">{submissions.map((submission) => {
    const identity = submissionIdentity(submission)
    return <details key={submission.id} className="rounded-xl border bg-card p-4">
      <summary className="cursor-pointer text-sm"><span className="font-semibold">{identity.name}</span><span className="ml-3 text-muted-foreground">{identity.school}</span><span className="ml-3 text-xs text-muted-foreground">{formatSurveyTime(submission.created_at)}</span></summary>
      {showRaw ? <dl className="mt-4 space-y-3">{config.questions.map((question) => <div key={question.id}><dt className="text-xs font-medium">{question.label.zh}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{customAnswerText(question, submission.custom_answers?.[question.id]) || "未填写"}</dd></div>)}{!config.questions.length && <p className="text-sm text-muted-foreground">已确认参加，无补充问题。</p>}</dl> : <p className="mt-3 text-xs text-muted-foreground">原始回答仅超级管理员可查看。</p>}
    </details>
  })}</div>
}
