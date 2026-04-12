import { redirect } from "next/navigation"
import { getPlayerInfo } from "@/lib/auth/player"
import { resolvePlayerRoute } from "@/lib/auth/routing"
import { fetchPlayerProfile, calcCompleteness } from "@/lib/queries/profile"
import { fetchOpenRound, fetchMySubmission } from "@/lib/queries/rounds"
import { ProfileCompleteness } from "@/components/player/ProfileCompleteness"
import { PlayerPendingView } from "@/components/player/PlayerPendingView"
import { SurveyStatusCard } from "@/components/player/SurveyStatusCard"
import { getTranslations } from "next-intl/server"

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
  const [profile, openRound] = await Promise.all([
    fetchPlayerProfile(approvedPlayer.memberId),
    fetchOpenRound(),
  ])
  const completeness = calcCompleteness(profile)

  // 检查是否已提交问卷
  let hasSubmitted = false
  if (openRound) {
    const submission = await fetchMySubmission(openRound.id, approvedPlayer.memberId)
    hasSubmitted = !!submission
  }

  return (
    <div className="p-6 space-y-6">
      <div className="animate-fade-in-up">
        <h1 className="heading-display text-2xl">{t("welcome", { name: approvedPlayer.name })}</h1>
        <p className="text-sm text-muted-foreground mt-1.5 tracking-wide">{t("subtitle")}</p>
      </div>

      {/* 进行中的问卷入口 */}
      {openRound && (
        <div className="animate-fade-in-up delay-1">
          <SurveyStatusCard
            roundName={openRound.round_name}
            surveyEnd={openRound.survey_end}
            hasSubmitted={hasSubmitted}
          />
        </div>
      )}

      <div className="animate-fade-in-up delay-2">
        <ProfileCompleteness completeness={completeness} />
      </div>
    </div>
  )
}
