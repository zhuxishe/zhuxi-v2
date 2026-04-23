import { redirect } from "next/navigation"
import { getPlayerInfo } from "@/lib/auth/player"
import { resolvePlayerRoute } from "@/lib/auth/routing"
import { fetchPlayerProfile, calcCompleteness } from "@/lib/queries/profile"
import { fetchOpenRound, fetchMySubmission } from "@/lib/queries/rounds"
import { fetchLandingScripts } from "@/lib/queries/scripts"
import { PlayerPendingView } from "@/components/player/PlayerPendingView"
import { PlayerHomeActivityCard } from "@/components/player/PlayerHomeActivityCard"
import { PlayerHomeTasks } from "@/components/player/PlayerHomeTasks"
import { getTranslations } from "next-intl/server"
import Link from "next/link"

export default async function PlayerHomePage() {
  const player = await getPlayerInfo()
  const t = await getTranslations("playerHome")

  const route = resolvePlayerRoute(
    player ? { status: player.status, hasIdentity: player.hasIdentity } : null
  )

  if (route.action === "redirect") return redirect(route.to)
  if (route.view === "pending") return <PlayerPendingView />
  if (route.view === "rejected") return <PlayerPendingView rejected />

  // At this point player is guaranteed to be non-null and approved
  const approvedPlayer = player!

  // Approved → normal home
  const [profile, openRound, activities] = await Promise.all([
    fetchPlayerProfile(approvedPlayer.memberId),
    fetchOpenRound(),
    fetchLandingScripts(3),
  ])
  const completeness = calcCompleteness(profile)

  // 检查是否已提交问卷
  let hasSubmitted = false
  if (openRound) {
    const submission = await fetchMySubmission(openRound.id, approvedPlayer.memberId)
    hasSubmitted = !!submission
  }

  return (
    <div className="space-y-5 p-4 pb-6">
      <div className="animate-fade-in-up rounded-xl bg-bamboo-muted p-4">
        <p className="text-xs font-semibold text-primary">{t("kicker")}</p>
        <h1 className="heading-display mt-2 text-2xl">{t("welcome", { name: approvedPlayer.name })}</h1>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="animate-fade-in-up delay-1">
        <PlayerHomeActivityCard
          activity={activities[0] ?? null}
          labels={{
            title: t("featuredActivity"),
            fallbackTitle: t("activityFallbackTitle"),
            fallbackDesc: t("activityFallbackDesc"),
            view: t("viewActivities"),
            people: t("people"),
          }}
        />
      </div>

      <div className="animate-fade-in-up delay-2 grid grid-cols-2 gap-3">
        <Link href="/app/scripts" className="rounded-xl bg-card p-4 shadow-soft">
          <span className="text-xs text-muted-foreground">{t("activityCount")}</span>
          <strong className="mt-1 block text-2xl">{activities.length}</strong>
        </Link>
        <Link href="/app/matches" className="rounded-xl bg-card p-4 shadow-soft">
          <span className="text-xs text-muted-foreground">{t("matchEntrance")}</span>
          <strong className="mt-1 block text-2xl">{openRound ? t("open") : t("waiting")}</strong>
        </Link>
      </div>

      <div className="animate-fade-in-up delay-3">
        <PlayerHomeTasks
          openRound={openRound}
          hasSubmitted={hasSubmitted}
          completeness={completeness}
          labels={{
            title: t("tasksTitle"),
            survey: t("surveyTask"),
            surveyDone: t("surveyDone"),
            surveyOpen: t("surveyOpen"),
            daysLeft: t("daysLeft"),
            profile: t("profileTask"),
            profileHint: t("profileHint"),
            activities: t("activitiesTask"),
            activitiesHint: t("activitiesHint"),
          }}
        />
      </div>
    </div>
  )
}
