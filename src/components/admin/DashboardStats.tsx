import { Users, Clock, CheckCircle, XCircle } from "lucide-react"

interface Stats {
  total: number
  pending: number
  approved: number
  rejected: number
}

const STAT_CARDS = [
  { key: "total", label: "总申请", icon: Users, color: "text-foreground" },
  { key: "pending", label: "待面试", icon: Clock, color: "text-orange-600" },
  { key: "approved", label: "已通过", icon: CheckCircle, color: "text-green-600" },
  { key: "rejected", label: "已拒绝", icon: XCircle, color: "text-red-600" },
] as const

export function DashboardStats({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {STAT_CARDS.map(({ key, label, icon: Icon, color }) => (
        <div
          key={key}
          className="rounded-xl bg-card p-4 shadow-soft"
        >
          <div className="flex items-center gap-2 mb-2">
            <Icon className={`size-4 ${color}`} />
            <span className="text-sm text-muted-foreground">{label}</span>
          </div>
          <p className={`text-2xl font-bold ${color}`}>{stats[key]}</p>
        </div>
      ))}
    </div>
  )
}
