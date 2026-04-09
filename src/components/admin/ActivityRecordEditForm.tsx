"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { updateActivityRecord } from "@/app/admin/activity-records/actions"
import { Button } from "@/components/ui/button"
import { SingleSelect } from "@/components/shared/SingleSelect"
import { MemberMultiSelect } from "@/components/admin/MemberMultiSelect"
import { ACTIVITY_TYPE_OPTIONS } from "@/lib/constants/reviews"

interface ActivityRecord {
  id: string
  title: string
  activity_date: string
  location: string | null
  activity_type: string | null
  duration_minutes: number | null
  notes: string | null
  participant_ids: string[] | null
  late_member_ids: string[] | null
  no_show_member_ids: string[] | null
}

interface Props {
  record: ActivityRecord
  members: { id: string; name: string }[]
  onDone: () => void
}

export function ActivityRecordEditForm({ record, members, onDone }: Props) {
  const router = useRouter()
  const [title, setTitle] = useState(record.title)
  const [date, setDate] = useState(record.activity_date)
  const [location, setLocation] = useState(record.location ?? "")
  const [type, setType] = useState(record.activity_type ?? "")
  const [duration, setDuration] = useState(record.duration_minutes ?? 180)
  const [notes, setNotes] = useState(record.notes ?? "")
  const [participantIds, setParticipantIds] = useState<string[]>(record.participant_ids ?? [])
  const [lateIds, setLateIds] = useState<string[]>(record.late_member_ids ?? [])
  const [noShowIds, setNoShowIds] = useState<string[]>(record.no_show_member_ids ?? [])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!title.trim() || !date) { setError("标题和日期为必填"); return }
    setSubmitting(true)
    setError(null)
    const result = await updateActivityRecord(record.id, {
      title, activity_date: date, location, activity_type: type,
      duration_minutes: duration, notes,
      participant_ids: participantIds,
      late_member_ids: lateIds,
      no_show_member_ids: noShowIds,
    })
    setSubmitting(false)
    if (result.error) setError(result.error)
    else { onDone(); router.refresh() }
  }

  return (
    <div className="rounded-xl bg-card p-5 ring-1 ring-primary/20 space-y-4 max-w-lg">
      <h3 className="text-sm font-semibold">编辑活动记录</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs font-medium mb-1 block">活动名称 *</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block">日期 *</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block">时长 (分钟)</label>
          <input type="number" value={duration} onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block">地点</label>
          <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block">类型</label>
          <SingleSelect options={[...ACTIVITY_TYPE_OPTIONS]} value={type} onChange={setType} />
        </div>
      </div>
      <MemberMultiSelect members={members} selected={participantIds} onChange={setParticipantIds} label="参与成员" />
      <MemberMultiSelect members={members} selected={lateIds} onChange={setLateIds} label="迟到成员" />
      <MemberMultiSelect members={members} selected={noShowIds} onChange={setNoShowIds} label="缺席成员" />
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="备注..."
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={handleSubmit} disabled={submitting}>{submitting ? "保存中..." : "保存修改"}</Button>
        <Button variant="outline" onClick={onDone}>取消</Button>
      </div>
    </div>
  )
}
