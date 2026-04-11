import { requirePlayer } from "@/lib/auth/player"
import { fetchPublishedScripts } from "@/lib/queries/scripts"
import { getTranslations } from "next-intl/server"
import { ScriptCard } from "@/components/player/ScriptCard"
import { ScriptGenreFilter } from "@/components/player/ScriptGenreFilter"
import { EmptyState } from "@/components/shared/EmptyState"
import { BookOpen } from "lucide-react"

interface Props {
  searchParams: Promise<{ q?: string; genre?: string }>
}

export default async function PlayerScriptsPage({ searchParams }: Props) {
  let t, scripts, q, genre
  try {
    await requirePlayer()
    t = await getTranslations("scripts")
    ;({ q, genre } = await searchParams)
    scripts = await fetchPublishedScripts(q, genre)
  } catch (err) {
    console.error("[PlayerScriptsPage]", err)
    return <pre className="p-4 text-xs text-red-600 whitespace-pre-wrap">{String(err)}</pre>
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="heading-display text-2xl">{t("title")}</h1>

      <ScriptGenreFilter currentGenre={genre ?? ""} />

      {scripts.length === 0 ? (
        <EmptyState icon={BookOpen} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {scripts.map((s) => (
            <ScriptCard key={s.id} script={s} />
          ))}
        </div>
      )}
    </div>
  )
}
