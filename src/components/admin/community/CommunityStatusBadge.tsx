import { cn } from "@/lib/utils"
import type { CommunityContentStatus, CommunityReportStatus, CommunityUserContentStatus } from "./types"

type Status = CommunityContentStatus | CommunityReportStatus | CommunityUserContentStatus

const STATUS_LABELS: Record<Status, string> = {
  draft: "草稿",
  published: "已发布",
  offline: "已下线",
  pending: "待处理",
  resolved: "已处理",
  dismissed: "已驳回",
  hidden: "已隐藏",
  deleted: "已删除",
}

const STATUS_CLASSES: Record<Status, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-emerald-100 text-emerald-700",
  offline: "bg-orange-100 text-orange-700",
  pending: "bg-orange-100 text-orange-700",
  resolved: "bg-emerald-100 text-emerald-700",
  dismissed: "bg-muted text-muted-foreground",
  hidden: "bg-amber-100 text-amber-800",
  deleted: "bg-red-100 text-red-700",
}

export function communityStatusLabel(status: string | null | undefined) {
  if (!status) return "—"
  return STATUS_LABELS[status as Status] ?? `未知状态（${status}）`
}

export function CommunityStatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <span className={cn("inline-flex rounded-full px-2 py-1 text-xs font-medium", STATUS_CLASSES[status], className)}>
      {communityStatusLabel(status)}
    </span>
  )
}
