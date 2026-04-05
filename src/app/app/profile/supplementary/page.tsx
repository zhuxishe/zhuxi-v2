import { requirePlayer } from "@/lib/auth/player"
import { fetchPlayerProfile } from "@/lib/queries/profile"
import { SupplementaryForm } from "@/components/player/SupplementaryForm"
import { getTranslations } from "next-intl/server"

export default async function SupplementaryPage() {
  const player = await requirePlayer()
  const t = await getTranslations("supplementary")
  const profile = await fetchPlayerProfile(player.memberId)

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-1">{t("title")}</h1>
      <p className="text-sm text-muted-foreground mb-6">{t("subtitle")}</p>
      <SupplementaryForm
        memberId={player.memberId}
        existingInterests={profile.member_interests}
        existingLanguage={profile.member_language}
      />
    </div>
  )
}
