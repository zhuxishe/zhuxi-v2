import { notFound } from "next/navigation"
import { requirePlayer } from "@/lib/auth/player"
import { fetchScript } from "@/lib/queries/scripts"
import { getTranslations } from "next-intl/server"
import { TagBadge } from "@/components/shared/TagBadge"
import { Clock, Users } from "lucide-react"

interface Props {
  params: Promise<{ id: string }>
}

export default async function ScriptDetailPage({ params }: Props) {
  await requirePlayer()
  const t = await getTranslations("scripts")
  const { id } = await params

  let script
  try {
    script = await fetchScript(id)
  } catch {
    notFound()
  }

  if (!script.is_published) notFound()

  return (
    <div className="p-6 max-w-lg space-y-4">
      {script.cover_url && (
        <img src={script.cover_url} alt={script.title} className="w-full max-h-48 object-cover rounded-xl" />
      )}

      <div className="space-y-2">
        <h1 className="text-xl font-bold">{script.title}</h1>
        {script.author && <p className="text-sm text-muted-foreground">{t("by")} {script.author}</p>}
      </div>

      <div className="flex gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5"><Users className="size-4" />{script.player_count_min}-{script.player_count_max}{t("players")}</span>
        <span className="flex items-center gap-1.5"><Clock className="size-4" />{script.duration_minutes}{t("minutes")}</span>
      </div>

      {script.genre_tags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {script.genre_tags.map((g: string) => <TagBadge key={g} label={g} />)}
          {script.theme_tags?.map((g: string) => <TagBadge key={g} label={g} variant="info" />)}
        </div>
      )}

      {script.description && (
        <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <p className="text-sm leading-relaxed">{script.description}</p>
        </div>
      )}

      {script.pdf_url && (
        <div className="rounded-xl bg-card ring-1 ring-foreground/10 overflow-hidden">
          <p className="text-sm font-semibold px-4 py-3 border-b border-border">{t("pdfPreview")}</p>
          <iframe src={script.pdf_url} className="w-full h-[500px]" />
        </div>
      )}
    </div>
  )
}
