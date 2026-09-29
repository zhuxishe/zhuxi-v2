"use client"

import type { RoundContentDraft, RoundPurpose } from "@/types"
import { formatTokyoDateTimeLocal, parseTokyoDateTimeLocal } from "@/lib/player-activity/tokyo-datetime"
import { changeRoundPurpose } from "./round-editor-state"

interface Props { draft: RoundContentDraft; locked: boolean; onChange: (draft: RoundContentDraft) => void }
const INPUT = "mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm disabled:opacity-60"

export function RoundBasicFields({ draft, locked, onChange }: Props) {
  return <section className="space-y-4 rounded-xl border bg-card p-5">
    <h2 className="font-semibold">用途与时间</h2>
    <label className="block text-sm">轮次／活动名称<input className={INPUT} value={draft.roundName} maxLength={120} required onChange={(event) => onChange({ ...draft, roundName: event.target.value })} /></label>
    <label className="block text-sm">用途<select className={INPUT} disabled={locked} value={draft.purpose} onChange={(event) => onChange(changeRoundPurpose(draft, event.target.value as RoundPurpose))}>
      <option value="matching">收集时间后匹配</option><option value="registration">固定时间活动报名</option><option value="announcement">仅发布活动通知</option>
    </select></label>
    <p className="text-xs text-muted-foreground">{draft.purpose === "matching" ? "收集每位玩家的可用时间和偏好，再运行匹配。" : draft.purpose === "registration" ? "展示固定时间、地点；用户确认参加，可以附加少量问题。" : "只展示活动信息，不收集报名或问卷。"}</p>
    <div className="grid gap-3 sm:grid-cols-2">
      {(["surveyStart", "surveyEnd"] as const).map((key, index) => <label key={key} className="block text-sm">{draft.purpose === "announcement" ? "展示" : "收集"}{index ? "截止" : "开放"}时间（日本时间）<input type="datetime-local" required className={INPUT} value={draft[key]} onChange={(event) => onChange({ ...draft, [key]: event.target.value })} /></label>)}
      {(["activityStart", "activityEnd"] as const).map((key, index) => <label key={key} className="block text-sm">活动{index ? "结束" : "开始"}日期<input type="date" required disabled={locked} className={INPUT} value={draft[key]} onChange={(event) => onChange({ ...draft, [key]: event.target.value })} /></label>)}
    </div>
    {draft.purpose !== "matching" && <div className="grid gap-3 sm:grid-cols-2">
      {(["eventStart", "eventEnd"] as const).map((key, index) => <label key={key} className="block text-sm">活动{index ? "结束" : "开始"}时间（日本时间）<input type="datetime-local" required={draft.purpose === "registration"} disabled={locked} className={INPUT} value={formatTokyoDateTimeLocal(draft.contentConfig[key])} onChange={(event) => onChange({ ...draft, contentConfig: { ...draft.contentConfig, [key]: parseTokyoDateTimeLocal(event.target.value) } })} /></label>)}
    </div>}
  </section>
}
