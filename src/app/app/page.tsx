import { requirePlayer } from "@/lib/auth/player"
import { fetchPlayerProfile, calcCompleteness } from "@/lib/queries/profile"
import { ProfileCompleteness } from "@/components/player/ProfileCompleteness"
import { getTranslations } from "next-intl/server"

export default async function PlayerHomePage() {
  const player = await requirePlayer()
  const t = await getTranslations("playerHome")

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
