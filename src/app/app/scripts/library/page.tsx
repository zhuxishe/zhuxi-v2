import { getLocale, getTranslations } from "next-intl/server"
import { requirePlayer } from "@/lib/auth/player"
import { fetchPlayerScriptLibrary } from "@/lib/player-activity/queries"
import { ActivityPageIntro } from "@/components/player/activity/ActivityPageIntro"
import { ScriptLibraryControls } from "@/components/player/activity/ScriptLibraryControls"
import { ScriptGrid } from "@/components/player/activity/SocialScriptCards"

interface PlayerScriptLibraryPageProps {
  searchParams: Promise<{ q?: string; genre?: string }>
}

export default async function PlayerScriptLibraryPage({ searchParams }: PlayerScriptLibraryPageProps) {
  await requirePlayer()
  const [params, locale, t] = await Promise.all([
    searchParams,
    getLocale(),
    getTranslations("activity"),
  ])
  const query = params.q?.trim().slice(0, 80) ?? ""
  const genre = params.genre?.trim() ?? ""
  const scripts = await fetchPlayerScriptLibrary(locale, query, genre)

  return (
    <div className="space-y-5 px-4 pb-7 pt-3">
      <ActivityPageIntro
        title={t("scriptLibraryTitle")}
        description={t("scriptLibrarySubtitle")}
        backHref="/app/scripts"
        backLabel={t("backToActivity")}
      />
      <ScriptLibraryControls
        query={query}
        genre={genre}
        locale={locale}
        labels={{
          searchPlaceholder: t("searchPlaceholder"),
          search: t("searchAction"),
          allGenres: t("allGenres"),
          genresAria: t("genresAria"),
        }}
      />
      <p className="text-xs text-muted-foreground">{t("resultCount", { count: scripts.length })}</p>
      <ScriptGrid
        scripts={scripts}
        locale={locale}
        peopleLabel={t("peopleUnit")}
        minutesLabel={t("minutesUnit")}
        emptyLabel={t("noLibraryScripts")}
      />
    </div>
  )
}
