import { redirect } from "next/navigation"
import { getPlayerInfo } from "@/lib/auth/player"
import { fetchPlayerProfile, calcCompleteness } from "@/lib/queries/profile"
import { fetchOpenRound, fetchMySubmission } from "@/lib/queries/rounds"
import { ProfileCompleteness } from "@/components/player/ProfileCompleteness"
import { PlayerPendingView } from "@/components/player/PlayerPendingView"
import { SurveyStatusCard } from "@/components/player/SurveyStatusCard"
import { getTranslations } from "next-intl/server"

export default async function PlayerHomePage() {
  const player = await getPlayerInfo()
  const t = await getTranslations("playerHome")

  // No member record → fill interview form
  if (!player) {
    redirect("/app/interview-form")
  }

  // Pending + no identity → fill interview form
  if (player.status === "pending" && !player.hasIdentity) {
    redirect("/app/interview-form")
  }

  // Pending + identity filled → show waiting page
  if (player.status === "pending") {
    return <PlayerPendingView />
  }

  // Rejected
  if (player.status === "rejected") {
    return <PlayerPendingView rejected />
  }

  // Approved → normal home
  const [profile, openRound] = await Promise.all([
    fetchPlayerProfile(player.memberId),
    fetchOpenRound(),
  ])
  const completeness = calcCompleteness(profile)

  // 检查是否已提交问卷
  let hasSubmitted = false
  if (openRound) {
    const submission = await fetchMySubmission(openRound.id, player.memberId)
    hasSubmitted = !!submission
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold">{t("welcome", { name: player.name })}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>

      {/* 进行中的问卷入口 */}
      {openRound && (
        <SurveyStatusCard
          roundName={openRound.round_name}
          surveyEnd={openRound.survey_end}
          hasSubmitted={hasSubmitted}
        />
      )}

      <ProfileCompleteness completeness={completeness} />
    </div>
  )
}
