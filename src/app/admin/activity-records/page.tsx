import { requireAdmin } from "@/lib/auth/admin"
import { fetchActivityRecords } from "@/lib/queries/activities"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { ActivityRecordForm } from "@/components/admin/ActivityRecordForm"
import { EmptyState } from "@/components/shared/EmptyState"
import { Calendar } from "lucide-react"

export default async function ActivityRecordsPage() {
  const admin = await requireAdmin()
  const records = await fetchActivityRecords()

  return (
    <div>
      <AdminTopBar admin={admin} title="活动记录" />
      <div className="p-6 space-y-6">
        <ActivityRecordForm />

        {records.length === 0 ? (
          <EmptyState icon={Calendar} title="暂无活动记录" description="添加第一条活动记录" />
        ) : (
          <div className="space-y-2">
            {records.map((r) => (
              <div key={r.id} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{r.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {r.activity_date} · {r.location ?? ""} · {r.participant_count}人
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">{r.activity_type}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
