import { requirePlayer } from "@/lib/auth/player"
import { fetchPublishedScripts } from "@/lib/queries/scripts"
import { getTranslations } from "next-intl/server"
import { ScriptCard } from "@/components/player/ScriptCard"
import { EmptyState } from "@/components/shared/EmptyState"
import { BookOpen } from "lucide-react"

interface Props {
  searchParams: Promise<{ q?: string }>
}

export default async function PlayerScriptsPage({ searchParams }: Props) {
  await requirePlayer()
  const t = await getTranslations("scripts")
  const { q } = await searchParams
  const scripts = await fetchPublishedScripts(q)

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold">{t("title")}</h1>

      {scripts.length === 0 ? (
        <EmptyState icon={BookOpen} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {scripts.map((s) => (
            <ScriptCard key={s.id} script={s} />
          ))}
        </div>
      )}
    </div>
  )
}
