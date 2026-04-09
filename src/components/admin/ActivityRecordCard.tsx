"use client"

import { useState, useTransition } from "react"
import { deleteActivityRecord } from "@/app/admin/activity-records/actions"
import { ActivityRecordEditForm } from "@/components/admin/ActivityRecordEditForm"
import { Button } from "@/components/ui/button"
import { Pencil, Trash2 } from "lucide-react"

interface ActivityRecord {
  id: string
  title: string
  activity_date: string
  location: string | null
  activity_type: string | null
  duration_minutes: number | null
  notes: string | null
  participant_ids: string[] | null
  participant_count: number | null
  late_member_ids: string[] | null
  no_show_member_ids: string[] | null
}

interface Props {
  record: ActivityRecord
  members: { id: string; name: string }[]
}

export function ActivityRecordCard({ record, members }: Props) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      await deleteActivityRecord(record.id)
      setConfirmDelete(false)
    })
  }

  if (editing) {
    return (
      <ActivityRecordEditForm
        record={record}
        members={members}
        onDone={() => setEditing(false)}
      />
    )
  }

  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{record.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {record.activity_date} · {record.location ?? ""} · {record.participant_count ?? 0}人
            {record.duration_minutes ? ` · ${record.duration_minutes}分钟` : ""}
          </p>
          {record.notes && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{record.notes}</p>
          )}
        </div>
        <div className="flex items-center gap-1 ml-3 shrink-0">
          <span className="text-xs text-muted-foreground mr-2">{record.activity_type}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={handleDelete} disabled={isPending}>
                {isPending ? "..." : "确认"}
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setConfirmDelete(false)}>
                取消
              </Button>
            </div>
          ) : (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/60 hover:text-destructive"
              onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
