import { getLocale, getTranslations } from "next-intl/server"
import { notFound } from "next/navigation"
import { requirePlayer } from "@/lib/auth/player"
import { fetchPlayerScriptLibrary } from "@/lib/player-activity/queries"
import type { PlayerScriptLibrarySort } from "@/lib/player-activity/types"
import { ActivityPageIntro } from "@/components/player/activity/ActivityPageIntro"
import { ScriptLibraryControls, ScriptLibraryPagination } from "@/components/player/activity/ScriptLibraryControls"
import { ScriptGrid } from "@/components/player/activity/SocialScriptCards"

interface PlayerScriptLibraryPageProps {
  searchParams: Promise<{
    q?: string
    genre?: string
    headcount?: string
    duration?: string
    sort?: string
    page?: string
  }>
}

export default async function PlayerScriptLibraryPage({ searchParams }: PlayerScriptLibraryPageProps) {
  await requirePlayer()
  const [params, locale, t] = await Promise.all([
    searchParams,
    getLocale(),
    getTranslations("activity"),
  ])
  const query = params.q?.trim().slice(0, 80) ?? ""
  const genre = params.genre?.trim().slice(0, 80) ?? ""
  const headcount = parseBoundedInteger(params.headcount, 1, 100)
  const duration = parseBoundedInteger(params.duration, 1, 1_440)
  const sort: PlayerScriptLibrarySort = params.sort === "recommended" ? "recommended" : "newest"
  const page = parseBoundedInteger(params.page, 1, 10_000) ?? 1
  const result = await fetchPlayerScriptLibrary(locale, {
    search: query,
    genre,
    headcount,
    duration,
    sort,
    page,
  })
  if (!result) notFound()

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
        headcount={headcount}
        duration={duration}
        sort={sort}
        locale={locale}
        labels={{
          searchPlaceholder: t("searchPlaceholder"),
          search: t("searchAction"),
          allGenres: t("allGenres"),
          genresAria: t("genresAria"),
        }}
      />
      <p className="text-xs text-muted-foreground">{t("resultCount", { count: result.total })}</p>
      <ScriptGrid
        scripts={result.items}
        locale={locale}
        peopleLabel={t("peopleUnit")}
        minutesLabel={t("minutesUnit")}
        emptyLabel={t("noLibraryScripts")}
      />
      <ScriptLibraryPagination
        page={result.page}
        totalPages={result.totalPages}
        query={query}
        genre={genre}
        headcount={headcount}
        duration={duration}
        sort={sort}
        locale={locale}
      />
    </div>
  )
}

function parseBoundedInteger(value: string | undefined, minimum: number, maximum: number) {
  if (!value || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null
}
