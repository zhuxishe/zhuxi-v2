import { cn } from "@/lib/utils"
import type { CommunityContentStatus, CommunityReportStatus } from "./types"

type Status = CommunityContentStatus | CommunityReportStatus

const STATUS_LABELS: Record<Status, string> = {
  draft: "草稿",
  published: "已发布",
  offline: "已下线",
  pending: "待处理",
  resolved: "已处理",
  dismissed: "已驳回",
}

const STATUS_CLASSES: Record<Status, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-emerald-100 text-emerald-700",
  offline: "bg-orange-100 text-orange-700",
  pending: "bg-orange-100 text-orange-700",
  resolved: "bg-emerald-100 text-emerald-700",
  dismissed: "bg-muted text-muted-foreground",
}

export function CommunityStatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <span className={cn("inline-flex rounded-full px-2 py-1 text-xs font-medium", STATUS_CLASSES[status], className)}>
      {STATUS_LABELS[status]}
    </span>
  )
}
