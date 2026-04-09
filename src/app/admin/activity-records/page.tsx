import { requireAdmin } from "@/lib/auth/admin"
import { fetchActivityRecords } from "@/lib/queries/activities"
import { fetchMemberBriefList } from "@/lib/queries/members"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { ActivityRecordForm } from "@/components/admin/ActivityRecordForm"
import { ActivityRecordCard } from "@/components/admin/ActivityRecordCard"
import { EmptyState } from "@/components/shared/EmptyState"
import { Calendar } from "lucide-react"

export default async function ActivityRecordsPage() {
  const admin = await requireAdmin()
  const [records, members] = await Promise.all([
    fetchActivityRecords(),
    fetchMemberBriefList(),
  ])

  return (
    <div>
      <AdminTopBar admin={admin} title="活动记录" />
      <div className="p-6 space-y-6">
        <ActivityRecordForm members={members} />

        {records.length === 0 ? (
          <EmptyState icon={Calendar} title="暂无活动记录" description="添加第一条活动记录" />
        ) : (
          <div className="space-y-2">
            {records.map((r) => (
              <ActivityRecordCard key={r.id} record={r} members={members} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
