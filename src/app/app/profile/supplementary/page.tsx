import { getPlayerQuestionnaire } from "@/lib/questionnaires/server"
import { requirePlayer } from "@/lib/auth/player"
import { fetchPlayerProfile } from "@/lib/queries/profile"
import { SupplementaryForm } from "@/components/player/SupplementaryForm"
import { questionnaireText } from "@/components/player/questionnaire-client"
import { getLocale, getTranslations } from "next-intl/server"

export default async function SupplementaryPage() {
  const player = await requirePlayer()
  const locale = await getLocale()
  const t = await getTranslations("supplementary")
  const [profile, questionnaire] = await Promise.all([fetchPlayerProfile(player.memberId), getPlayerQuestionnaire("supplementary")])

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-1">{questionnaire && !questionnaire.isBaseline ? questionnaireText(questionnaire.template.title, locale) : t("title")}</h1>
      <p className="text-sm text-muted-foreground mb-6">{t("subtitle")}</p>
      <SupplementaryForm
        memberId={player.memberId}
        existingInterests={profile.member_interests}
        existingLanguage={profile.member_language}
        questionnaire={questionnaire}
      />
    </div>
  )
}
