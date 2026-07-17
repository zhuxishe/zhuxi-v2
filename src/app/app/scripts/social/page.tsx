import { getLocale, getTranslations } from "next-intl/server"
import { requirePlayer } from "@/lib/auth/player"
import { fetchPlayerSocialLibrary } from "@/lib/player-activity/queries"
import { ActivityPageIntro } from "@/components/player/activity/ActivityPageIntro"
import { ActivitySectionHeader } from "@/components/player/activity/ActivitySectionHeader"
import { ScriptGrid, SocialScriptShelf } from "@/components/player/activity/SocialScriptCards"

export default async function SocialScriptLibraryPage() {
  await requirePlayer()
  const [locale, t] = await Promise.all([
    getLocale(),
    getTranslations("activity"),
  ])
  const sections = await fetchPlayerSocialLibrary(locale)

  return (
    <div className="space-y-7 px-4 pb-7 pt-3">
      <ActivityPageIntro
        title={t("socialLibraryTitle")}
        description={t("socialLibrarySubtitle")}
        backHref="/app/scripts"
        backLabel={t("backToActivity")}
      />

      <section>
        <ActivitySectionHeader title={t("pinnedScriptsTitle")} />
        <SocialScriptShelf scripts={sections.pinned} locale={locale} emptyLabel={t("noPinnedScripts")} />
      </section>

      <section>
        <ActivitySectionHeader title={t("moreScriptsTitle")} />
        <ScriptGrid
          scripts={sections.more}
          locale={locale}
          peopleLabel={t("peopleUnit")}
          minutesLabel={t("minutesUnit")}
          emptyLabel={t("noMoreScripts")}
        />
      </section>
    </div>
  )
}
