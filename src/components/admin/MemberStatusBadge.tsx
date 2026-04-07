import { cn } from "@/lib/utils"
import type { MemberStatus } from "@/types"

const STATUS_MAP: Record<MemberStatus, { label: string; className: string }> = {
  pending: { label: "待面试", className: "bg-orange-100 text-orange-800" },
  approved: { label: "已通过", className: "bg-green-100 text-green-800" },
  rejected: { label: "已拒绝", className: "bg-red-100 text-red-800" },
  inactive: { label: "已停用", className: "bg-gray-100 text-gray-600" },
}

interface Props {
  status: string
}

export function MemberStatusBadge({ status }: Props) {
  const { label, className } = STATUS_MAP[status as MemberStatus] ?? STATUS_MAP.pending
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", className)}>
      {label}
    </span>
  )
}
