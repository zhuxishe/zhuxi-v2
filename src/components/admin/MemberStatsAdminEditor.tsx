"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  deleteMemberNote,
  overrideMemberDynamicStats,
  upsertMemberNote,
} from "@/app/admin/members/[id]/stats/actions"
import { adminAuditReasonIsValid } from "@/lib/member-master/audit-reason"

interface DynamicStats {
  activity_count: number
  review_count: number
  avg_review_score: number | null
  late_count: number
  no_show_count: number
  complaint_count: number
  last_activity_at: string | null
  reliability_score: number
  replay_willing_rate: number | null
  recent5_avg_score: number | null
}

interface MemberNote {
  id: string
  note: string
  created_at: string
}

interface Props {
  memberId: string
  stats: DynamicStats | null
  notes: MemberNote[]
  canOverrideRaw: boolean
}

function dateTimeLocal(value: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function optionalNumberInRange(value: string, min: number, max: number) {
  if (value.trim() === "") return { valid: true, value: null as number | null }
  const parsed = Number(value)
  return {
    valid: Number.isFinite(parsed) && parsed >= min && parsed <= max,
    value: Number.isFinite(parsed) ? parsed : null,
  }
}

export function MemberStatsAdminEditor({ memberId, stats, notes, canOverrideRaw }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [reason, setReason] = useState("")
  const [newNote, setNewNote] = useState("")
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [raw, setRaw] = useState({
    activityCount: String(stats?.activity_count ?? 0),
    reviewCount: String(stats?.review_count ?? 0),
    avgReviewScore: stats?.avg_review_score == null ? "" : String(stats.avg_review_score),
    lateCount: String(stats?.late_count ?? 0),
    noShowCount: String(stats?.no_show_count ?? 0),
    complaintCount: String(stats?.complaint_count ?? 0),
    lastActivityAt: dateTimeLocal(stats?.last_activity_at ?? null),
    reliabilityScore: String(stats?.reliability_score ?? 5),
    replayWillingRate: stats?.replay_willing_rate == null ? "" : String(stats.replay_willing_rate),
    recent5AvgScore: stats?.recent5_avg_score == null ? "" : String(stats.recent5_avg_score),
  })
  const reasonValid = adminAuditReasonIsValid(reason)

  function begin(task: () => Promise<{ error?: string; success?: boolean }>, success: string) {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await task()
      if (result.error) {
        setError(result.error)
        return
      }
      setMessage(success)
      router.refresh()
    })
  }

  function saveStats() {
    const integers = [
      raw.activityCount,
      raw.reviewCount,
      raw.lateCount,
      raw.noShowCount,
      raw.complaintCount,
    ].map(Number)
    if (integers.some((value) => !Number.isInteger(value) || value < 0 || value > 1_000_000)) {
      setError("次数字段必须是 0–1,000,000 的整数")
      return
    }
    const reliabilityScore = Number(raw.reliabilityScore)
    if (!Number.isFinite(reliabilityScore) || reliabilityScore < 0 || reliabilityScore > 5) {
      setError("信用分必须在 0–5 之间")
      return
    }
    const avgReviewScore = optionalNumberInRange(raw.avgReviewScore, 0, 5)
    const recent5AvgScore = optionalNumberInRange(raw.recent5AvgScore, 0, 5)
    const replayWillingRate = optionalNumberInRange(raw.replayWillingRate, 0, 1)
    if (!avgReviewScore.valid || !recent5AvgScore.valid || !replayWillingRate.valid) {
      setError("评分必须在 0–5 之间，愿意再玩比例必须在 0–1 之间")
      return
    }
    let lastActivityAt: string | null = null
    if (raw.lastActivityAt) {
      const parsed = new Date(raw.lastActivityAt)
      if (Number.isNaN(parsed.getTime())) {
        setError("最近活动时间格式不正确")
        return
      }
      lastActivityAt = parsed.toISOString()
    }
    begin(
      () => overrideMemberDynamicStats(memberId, {
        activityCount: integers[0],
        reviewCount: integers[1],
        avgReviewScore: avgReviewScore.value,
        lateCount: integers[2],
        noShowCount: integers[3],
        complaintCount: integers[4],
        lastActivityAt,
        reliabilityScore,
        replayWillingRate: replayWillingRate.value,
        recent5AvgScore: recent5AvgScore.value,
        reason,
      }),
      "原始统计值已保存并记录审计",
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-2">
        <label htmlFor="stats-audit-reason" className="text-sm font-semibold">本次修改理由</label>
        <input
          id="stats-audit-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          minLength={4}
          maxLength={500}
          placeholder="必填，4–500 字；用于统计覆盖和备注增改删审计"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        {message && <p className="text-xs text-green-600">{message}</p>}
      </div>

      {canOverrideRaw && (
        <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4">
          <div>
            <h3 className="text-sm font-semibold">原始动态统计覆盖</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              仅超级管理员可修改业务数值；记录 ID、成员关联和技术时间不可编辑。
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField label="参加活动次数" value={raw.activityCount} onChange={(value) => setRaw({ ...raw, activityCount: value })} min={0} step={1} />
            <NumberField label="收到评价次数" value={raw.reviewCount} onChange={(value) => setRaw({ ...raw, reviewCount: value })} min={0} step={1} />
            <NumberField label="平均评分（0–5，可空）" value={raw.avgReviewScore} onChange={(value) => setRaw({ ...raw, avgReviewScore: value })} min={0} max={5} step={0.1} />
            <NumberField label="最近 5 次平均分（0–5，可空）" value={raw.recent5AvgScore} onChange={(value) => setRaw({ ...raw, recent5AvgScore: value })} min={0} max={5} step={0.1} />
            <NumberField label="迟到次数" value={raw.lateCount} onChange={(value) => setRaw({ ...raw, lateCount: value })} min={0} step={1} />
            <NumberField label="缺席次数" value={raw.noShowCount} onChange={(value) => setRaw({ ...raw, noShowCount: value })} min={0} step={1} />
            <NumberField label="投诉次数" value={raw.complaintCount} onChange={(value) => setRaw({ ...raw, complaintCount: value })} min={0} step={1} />
            <NumberField label="信用分（0–5）" value={raw.reliabilityScore} onChange={(value) => setRaw({ ...raw, reliabilityScore: value })} min={0} max={5} step={0.1} />
            <NumberField label="愿意再玩比例（0–1，可空）" value={raw.replayWillingRate} onChange={(value) => setRaw({ ...raw, replayWillingRate: value })} min={0} max={1} step={0.01} />
            <label className="space-y-1 text-xs font-medium">
              最近活动时间（可空）
              <input
                type="datetime-local"
                value={raw.lastActivityAt}
                onChange={(event) => setRaw({ ...raw, lastActivityAt: event.target.value })}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm font-normal"
              />
            </label>
          </div>
          <Button type="button" onClick={saveStats} disabled={pending || !reasonValid}>
            保存原始统计值
          </Button>
        </div>
      )}

      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4">
        <div>
          <h3 className="text-sm font-semibold">运营备注 ({notes.length})</h3>
          <p className="mt-1 text-xs text-muted-foreground">管理员可增改删；每次操作都写入成员审计。</p>
        </div>
        <div className="space-y-2">
          <textarea
            value={newNote}
            onChange={(event) => setNewNote(event.target.value)}
            maxLength={5000}
            placeholder="新增运营备注"
            rows={3}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          <Button
            type="button"
            variant="outline"
            disabled={pending || !reasonValid || !newNote.trim()}
            onClick={() => begin(
              async () => {
                const result = await upsertMemberNote({ noteId: null, memberId, note: newNote, reason })
                if (!result.error) setNewNote("")
                return result
              },
              "备注已新增",
            )}
          >
            新增备注
          </Button>
        </div>

        {notes.length === 0 ? (
          <p className="text-xs text-muted-foreground">暂无备注</p>
        ) : notes.map((note) => (
          <div key={note.id} className="rounded-lg border bg-muted/20 p-3 space-y-2">
            <textarea
              value={noteDrafts[note.id] ?? note.note}
              onChange={(event) => setNoteDrafts({ ...noteDrafts, [note.id]: event.target.value })}
              maxLength={5000}
              rows={3}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {new Date(note.created_at).toLocaleString("zh-CN")}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending || !reasonValid || !(noteDrafts[note.id] ?? note.note).trim()}
                  onClick={() => begin(
                    () => upsertMemberNote({
                      noteId: note.id,
                      memberId,
                      note: noteDrafts[note.id] ?? note.note,
                      reason,
                    }),
                    "备注已更新",
                  )}
                >
                  保存
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={pending || !reasonValid}
                  onClick={() => {
                    if (!window.confirm("确认删除这条备注？审计历史仍会保留。")) return
                    begin(() => deleteMemberNote({ noteId: note.id, memberId, reason }), "备注已删除")
                  }}
                >
                  删除
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  min?: number
  max?: number
  step?: number
}) {
  return (
    <label className="space-y-1 text-xs font-medium">
      {label}
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        min={min}
        max={max}
        step={step}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm font-normal"
      />
    </label>
  )
}
