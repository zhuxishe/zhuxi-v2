"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createActivityRecord } from "@/app/admin/activity-records/actions"
import { Button } from "@/components/ui/button"
import { SingleSelect } from "@/components/shared/SingleSelect"
import { ACTIVITY_TYPE_OPTIONS } from "@/lib/constants/reviews"

export function ActivityRecordForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [date, setDate] = useState("")
  const [location, setLocation] = useState("")
  const [type, setType] = useState("")
  const [duration, setDuration] = useState(180)
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!title.trim() || !date) { setError("标题和日期为必填"); return }
    setSubmitting(true)
    setError(null)
    const result = await createActivityRecord({
      title, activity_date: date, location, activity_type: type,
      duration_minutes: duration, notes,
      participant_ids: [], late_member_ids: [], no_show_member_ids: [],
    })
    setSubmitting(false)
    if (result.error) setError(result.error)
    else { setOpen(false); router.refresh() }
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)}>添加活动记录</Button>
  }

  return (
    <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4 max-w-lg">
      <h3 className="text-sm font-semibold">新建活动记录</h3>
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
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="备注..."
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={handleSubmit} disabled={submitting}>{submitting ? "保存中..." : "保存"}</Button>
        <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
      </div>
    </div>
  )
}
