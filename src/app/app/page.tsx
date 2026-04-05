import { redirect } from "next/navigation"
import { getPlayerInfo } from "@/lib/auth/player"
import { fetchPlayerProfile, calcCompleteness } from "@/lib/queries/profile"
import { ProfileCompleteness } from "@/components/player/ProfileCompleteness"
import { PlayerPendingView } from "@/components/player/PlayerPendingView"
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
  const profile = await fetchPlayerProfile(player.memberId)
  const completeness = calcCompleteness(profile)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold">{t("welcome", { name: player.name })}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>
      <ProfileCompleteness completeness={completeness} />
    </div>
  )
}
