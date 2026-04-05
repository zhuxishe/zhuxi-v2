import { Activity, Star, AlertTriangle, ThumbsUp } from "lucide-react"

interface Stats {
  activity_count: number
  review_count: number
  avg_review_score: number | null
  late_count: number
  no_show_count: number
  complaint_count: number
  reliability_score: number
  last_activity_at: string | null
}

interface Props {
  stats: Stats | null
}

export function StatsCard({ stats }: Props) {
  if (!stats) {
    return (
      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <p className="text-sm text-muted-foreground">暂无统计数据（该成员还没有活动记录）</p>
      </div>
    )
  }

  const items = [
    { label: "参加活动", value: stats.activity_count, icon: Activity, color: "text-primary" },
    { label: "收到评价", value: stats.review_count, icon: Star, color: "text-yellow-500" },
    { label: "平均评分", value: stats.avg_review_score?.toFixed(1) ?? "-", icon: ThumbsUp, color: "text-green-500" },
    { label: "信用分", value: stats.reliability_score.toFixed(1), icon: Star, color: "text-primary" },
    { label: "迟到", value: stats.late_count, icon: AlertTriangle, color: "text-orange-500" },
    { label: "爽约", value: stats.no_show_count, icon: AlertTriangle, color: "text-red-500" },
  ]

  return (
    <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4">
      <h3 className="text-sm font-semibold">动态统计</h3>
      <div className="grid grid-cols-3 gap-3">
        {items.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-lg bg-muted/30 p-3 text-center">
            <Icon className={`size-4 mx-auto mb-1 ${color}`} />
            <p className="text-lg font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      {stats.last_activity_at && (
        <p className="text-xs text-muted-foreground">
          最近活动: {new Date(stats.last_activity_at).toLocaleDateString("zh-CN")}
        </p>
      )}
    </div>
  )
}
