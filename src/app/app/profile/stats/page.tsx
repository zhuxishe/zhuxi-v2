import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ArrowLeft, Star, Activity, ThumbsUp } from "lucide-react"
import { requirePlayer } from "@/lib/auth/player"
import { fetchMemberStats, fetchPlayerActivities } from "@/lib/queries/activities"
import { fetchMyProfileSummary } from "@/lib/profile/queries"
import { PlayerLevelGuide, type PlayerLevelGuideCopy } from "@/components/player/profile/PlayerLevelGuide"

export default async function PlayerStatsPage() {
  const player = await requirePlayer()
  const [t, profile, stats, activities] = await Promise.all([
    getTranslations("playerStats"),
    fetchMyProfileSummary(),
    fetchMemberStats(player.memberId),
    fetchPlayerActivities(player.memberId),
  ])

  return (
    <div className="space-y-6 px-4 pb-7 pt-3">
      <header>
        <Link href="/app/profile" className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <ArrowLeft className="size-4" aria-hidden="true" />{t("backToProfile")}
        </Link>
        <h1 className="heading-display mt-1 text-[2rem] font-semibold leading-tight tracking-tight">{t("title")}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("subtitle")}</p>
      </header>

      <PlayerLevelGuide level={profile.level} copy={t.raw("levelGuide") as PlayerLevelGuideCopy} />

      <section className="space-y-3 border-t border-border pt-5" aria-labelledby="activity-stats-title">
        <h2 id="activity-stats-title" className="text-base font-semibold tracking-tight">{t("statsTitle")}</h2>
        <div className="grid grid-cols-3 gap-2">
          <StatBox icon={Activity} label={t("activities")} value={stats?.activity_count ?? 0} />
          <StatBox icon={Star} label={t("reviews")} value={stats?.review_count ?? 0} />
          <StatBox icon={ThumbsUp} label={t("avgScore")} value={stats?.avg_review_score?.toFixed(1) ?? "-"} />
        </div>

        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold">{t("recentActivities")}</h3>
          {activities.length === 0 ? (
            <div className="py-5 text-center">
              <Activity className="mx-auto mb-2 size-6 text-primary/50" aria-hidden="true" />
              <p className="text-xs leading-5 text-muted-foreground">{t("noActivities")}</p>
            </div>
          ) : (
            activities.slice(0, 10).map((activity) => (
              <div key={activity.id} className="flex items-start justify-between gap-3 border-b border-border py-2 last:border-0">
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium">{activity.title}</p>
                  <p className="text-xs text-muted-foreground">{activity.location}</p>
                </div>
                <time dateTime={activity.activity_date} className="shrink-0 text-xs tabular-nums text-muted-foreground">{activity.activity_date}</time>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}

function StatBox({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-2 py-4 text-center">
      <Icon className="mx-auto mb-2 size-4 text-primary" aria-hidden="true" />
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
