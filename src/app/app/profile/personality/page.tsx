import { requirePlayer } from "@/lib/auth/player"
import { fetchPlayerProfile } from "@/lib/queries/profile"
import { PersonalitySelfAssessment } from "@/components/player/PersonalitySelfAssessment"
import { getTranslations } from "next-intl/server"

export default async function PersonalityPage() {
  const player = await requirePlayer()
  const t = await getTranslations("personality")
  const profile = await fetchPlayerProfile(player.memberId)

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-1">{t("title")}</h1>
      <p className="text-sm text-muted-foreground mb-6">{t("subtitle")}</p>
      <PersonalitySelfAssessment
        existing={profile.member_personality}
      />
    </div>
  )
}
