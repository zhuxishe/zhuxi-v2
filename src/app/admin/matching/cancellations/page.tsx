import { requireAdmin } from "@/lib/auth/admin"
import { fetchPendingCancellations } from "@/lib/queries/cancellations"
import { CancellationList } from "@/components/admin/CancellationList"

export default async function CancellationsPage() {
  await requireAdmin()
  const requests = await fetchPendingCancellations()

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">取消申请审批</h1>
      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无待审核的取消申请</p>
      ) : (
        <CancellationList requests={requests} />
      )}
    </div>
  )
}
