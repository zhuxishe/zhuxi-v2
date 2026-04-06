import { Suspense } from "react"
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
  await requirePlayer()
  const t = await getTranslations("scripts")
  const { q, genre } = await searchParams
  const scripts = await fetchPublishedScripts(q, genre)

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">{t("title")}</h1>

      <Suspense fallback={null}>
        <ScriptGenreFilter />
      </Suspense>

      {scripts.length === 0 ? (
        <EmptyState icon={BookOpen} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {scripts.map((s) => (
            <ScriptCard key={s.id} script={s} />
          ))}
        </div>
      )}
    </div>
  )
}
