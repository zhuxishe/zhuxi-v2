import { requirePlayer } from "@/lib/auth/player"
import { fetchMemberStats, fetchPlayerActivities } from "@/lib/queries/activities"
import { getTranslations } from "next-intl/server"
import { Star, Activity, ThumbsUp } from "lucide-react"

export default async function PlayerStatsPage() {
  const player = await requirePlayer()
  const t = await getTranslations("playerStats")
  const stats = await fetchMemberStats(player.memberId)
  const activities = await fetchPlayerActivities(player.memberId)

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold">{t("title")}</h1>

      <div className="grid grid-cols-3 gap-3">
        <StatBox icon={Activity} label={t("activities")} value={stats?.activity_count ?? 0} color="text-primary" />
        <StatBox icon={Star} label={t("reviews")} value={stats?.review_count ?? 0} color="text-yellow-500" />
        <StatBox icon={ThumbsUp} label={t("avgScore")} value={stats?.avg_review_score?.toFixed(1) ?? "-"} color="text-green-500" />
      </div>

      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-3">
        <h2 className="text-sm font-semibold">{t("recentActivities")}</h2>
        {activities.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("noActivities")}</p>
        ) : (
          activities.slice(0, 10).map((a) => (
            <div key={a.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <div>
                <p className="text-sm font-medium">{a.title}</p>
                <p className="text-xs text-muted-foreground">{a.location}</p>
              </div>
              <span className="text-xs text-muted-foreground">{a.activity_date}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function StatBox({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-xl bg-card p-3 ring-1 ring-foreground/10 text-center">
      <Icon className={`size-5 mx-auto mb-1 ${color}`} />
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
