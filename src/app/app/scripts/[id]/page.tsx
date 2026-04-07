import { notFound } from "next/navigation"
import { requirePlayer } from "@/lib/auth/player"
import { fetchScript, checkScriptAccess } from "@/lib/queries/scripts"
import { getTranslations } from "next-intl/server"
import { TagBadge } from "@/components/shared/TagBadge"
import { ScriptRoleList } from "@/components/player/ScriptRoleList"
import { FlipBookViewer } from "@/components/player/FlipBookViewer"
import { Clock, Users, AlertTriangle, Eye, Lock } from "lucide-react"
import { SCRIPT_DIFFICULTY_OPTIONS } from "@/lib/constants/scripts"

interface Props {
  params: Promise<{ id: string }>
}

export default async function ScriptDetailPage({ params }: Props) {
  const player = await requirePlayer()
  const { id } = await params

  let script
  try {
    script = await fetchScript(id)
  } catch {
    notFound()
  }

  if (!script.is_published) notFound()

  const canViewFull = await checkScriptAccess(id, player.memberId)
  const t = await getTranslations("scriptDetail")
  const diffLabel = SCRIPT_DIFFICULTY_OPTIONS.find((d) => d.value === script.difficulty)?.label ?? script.difficulty

  return (
    <div className="p-4 max-w-lg mx-auto space-y-5 pb-24">
      {/* Cover */}
      <CoverImage url={script.cover_url} title={script.title} />

      {/* Title + Author + Difficulty */}
      <div className="space-y-1.5">
        <div className="flex items-start gap-2">
          <h1 className="text-xl font-bold flex-1">{script.title}</h1>
          <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            {diffLabel}
          </span>
        </div>
        {script.author && <p className="text-sm text-muted-foreground">{t("author")} {script.author}</p>}
      </div>

      {/* Players + Duration */}
      <div className="flex gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Users className="size-4" />{t("players", { min: script.player_count_min, max: script.player_count_max })}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="size-4" />{t("duration", { minutes: script.duration_minutes })}
        </span>
      </div>

      {/* Genre + Theme tags */}
      <TagSection genreTags={script.genre_tags} themeTags={script.theme_tags} />

      {/* Warnings */}
      {script.warnings?.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-orange-50 p-3 text-sm text-orange-800 dark:bg-orange-900/20 dark:text-orange-300">
          <AlertTriangle className="size-4 mt-0.5 shrink-0" />
          <span>{script.warnings.join("、")}</span>
        </div>
      )}

      {/* Content HTML */}
      {script.content_html && (
        <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <h3 className="text-sm font-semibold mb-2">{t("intro")}</h3>
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{script.content_html.replace(/<[^>]*>/g, "")}</div>
        </div>
      )}

      {/* Description fallback */}
      {!script.content_html && script.description && (
        <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <p className="text-sm leading-relaxed">{script.description}</p>
        </div>
      )}

      {/* Roles */}
      <ScriptRoleList roles={script.roles} />

      {/* 翻页书阅读器 / 权限控制 */}
      {canViewFull && script.page_images?.length > 0 ? (
        <div className="rounded-xl overflow-hidden ring-1 ring-foreground/10">
          <FlipBookViewer pages={script.page_images} title={script.title} />
        </div>
      ) : (
        <AccessSection canViewFull={canViewFull} pdfUrl={script.pdf_url} viewFullLabel={t("viewFull")} needAccessLabel={t("needAccess")} />
      )}
    </div>
  )
}

/* ---------- Sub-components (keep file compact) ---------- */

function CoverImage({ url, title }: { url: string | null; title: string }) {
  if (url) {
    return <img src={url} alt={title} className="aspect-[3/4] w-full object-cover rounded-xl" />
  }
  return (
    <div className="aspect-[3/4] w-full bg-gradient-to-br from-primary/20 to-primary/5 rounded-xl flex items-center justify-center p-8">
      <span className="text-2xl font-bold text-foreground/50 text-center leading-tight">{title}</span>
    </div>
  )
}

function TagSection({ genreTags, themeTags }: { genreTags?: string[]; themeTags?: string[] }) {
  const hasGenre = genreTags && genreTags.length > 0
  const hasTheme = themeTags && themeTags.length > 0
  if (!hasGenre && !hasTheme) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {genreTags?.map((g) => <TagBadge key={g} label={g} />)}
      {themeTags?.map((g) => <TagBadge key={g} label={g} variant="info" />)}
    </div>
  )
}

function AccessSection({ canViewFull, pdfUrl, viewFullLabel, needAccessLabel }: { canViewFull: boolean; pdfUrl?: string | null; viewFullLabel: string; needAccessLabel: string }) {
  if (canViewFull && pdfUrl) {
    return (
      <a
        href={pdfUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        <Eye className="size-4" />
        {viewFullLabel}
      </a>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-xl bg-muted p-4 text-sm text-muted-foreground">
      <Lock className="size-4 shrink-0" />
      <span>{needAccessLabel}</span>
    </div>
  )
}
