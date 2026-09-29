"use client"

import { formatAdminDateTime } from "@/lib/admin-datetime"
import type { RoundContentConfig } from "@/types"
import { customAnswerText, submissionIdentity } from "@/lib/matching/round-submission-export"

export function RoundAnswerList({ submissions, config, showRaw, registration = false }: { submissions: Record<string, any>[]; config: RoundContentConfig; showRaw: boolean; registration?: boolean }) {
  if (!submissions.length) return <p className="py-6 text-center text-sm text-muted-foreground">暂无提交记录</p>
  return <div className="space-y-3">{submissions.map((submission) => {
    const identity = submissionIdentity(submission)
    const cancelled = registration && Boolean(submission.cancelled_at)
    return <details key={submission.id} className="rounded-xl border bg-card p-4">
      <summary className="cursor-pointer text-sm"><span className="font-semibold">{identity.name}</span><span className="ml-3 text-muted-foreground">{identity.school}</span><span className="ml-3 text-xs text-muted-foreground">{formatAdminDateTime(submission.created_at)}</span>{registration && <span className={`ml-3 inline-flex rounded-full px-2 py-0.5 text-xs ${cancelled ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>{cancelled ? "已取消" : "有效报名"}</span>}</summary>
      {cancelled && <p className="mt-2 text-xs text-muted-foreground">取消时间：{formatAdminDateTime(submission.cancelled_at)}（日本时间）</p>}
      {showRaw ? <dl className="mt-4 space-y-3">{config.questions.map((question) => <div key={question.id}><dt className="text-xs font-medium">{question.label.zh}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{customAnswerText(question, submission.custom_answers?.[question.id]) || "未填写"}</dd></div>)}{!config.questions.length && <p className="text-sm text-muted-foreground">{cancelled ? "该报名已取消，保留提交记录。" : "已确认参加，无补充问题。"}</p>}</dl> : <p className="mt-3 text-xs text-muted-foreground">原始回答仅超级管理员可查看。</p>}
    </details>
  })}</div>
}
