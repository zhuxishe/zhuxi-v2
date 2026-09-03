import Image from "next/image"
import { notFound } from "next/navigation"
import { requirePlayer } from "@/lib/auth/player"
import { fetchPlayerActivitySettings } from "@/lib/player-activity/queries"
import { fetchAuthorizedScriptContent, fetchPlayerScriptMetadata } from "@/lib/queries/scripts"
import { getTranslations, getLocale } from "next-intl/server"
import { TagBadge } from "@/components/shared/TagBadge"
import { ScriptRoleList } from "@/components/player/ScriptRoleList"
import { FlipBookViewer } from "@/components/player/FlipBookViewer"
import { Clock, Users, AlertTriangle, Eye, Lock } from "lucide-react"
import { SCRIPT_DIFFICULTY_OPTIONS } from "@/lib/constants/scripts"
import { localizeTag } from "@/lib/constants/tags-i18n"
import { rewriteStorageUrl } from "@/lib/storage-url"

interface Props {
  params: Promise<{ id: string }>
}

export default async function ScriptDetailPage({ params }: Props) {
  const player = await requirePlayer()
  const { id } = await params

  const [script, settings] = await Promise.all([
    fetchPlayerScriptMetadata(id),
    fetchPlayerActivitySettings(),
  ]).catch(() => notFound())

  if (!script) notFound()
  const detailEnabled = settings.scriptLibraryEnabled
    || (settings.socialScriptsEnabled && script.is_social_script)
  if (!detailEnabled) notFound()

  const protectedContent = await fetchAuthorizedScriptContent(id, player.memberId)
  const canViewFull = protectedContent.canViewFull
  const t = await getTranslations("scriptDetail")
  const locale = await getLocale()
  const diffRaw = SCRIPT_DIFFICULTY_OPTIONS.find((d) => d.value === script.difficulty)?.label ?? script.difficulty ?? ""
  const diffLabel = localizeTag(diffRaw, locale)
  const coverUrl = rewriteStorageUrl(script.cover_url)
  const pdfUrl = protectedContent.pdfUrl
  const pageImages = protectedContent.pageImageUrls

  return (
    <div className="p-4 max-w-lg mx-auto space-y-5 pb-24">
      {/* Cover */}
      <CoverImage url={coverUrl} title={script.title} />

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
          <Users className="size-4" />{t("players", { min: script.player_count_min ?? 0, max: script.player_count_max ?? 0 })}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="size-4" />{t("duration", { minutes: script.duration_minutes ?? 0 })}
        </span>
      </div>

      {/* Genre + Theme tags */}
      <TagSection genreTags={script.genre_tags} themeTags={script.theme_tags} locale={locale} />

      {/* Warnings */}
      {script.warnings?.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-orange-50 p-3 text-sm text-orange-800 dark:bg-orange-900/20 dark:text-orange-300">
          <AlertTriangle className="size-4 mt-0.5 shrink-0" />
          <span>{script.warnings.join("、")}</span>
        </div>
      )}

      {/* Public Player metadata */}
      {script.description && (
        <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <h3 className="text-sm font-semibold mb-2">{t("intro")}</h3>
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{script.description}</div>
        </div>
      )}

      {/* Authorized core content */}
      {canViewFull && protectedContent.coreContentHtml && (
        <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{plainText(protectedContent.coreContentHtml)}</div>
        </div>
      )}

      {/* Roles */}
      {canViewFull ? (
        <ScriptRoleList roles={protectedContent.roles as { name: string; gender?: string; description?: string }[] | null} />
      ) : null}

      {/* 翻页书阅读器 / 权限控制 */}
      {canViewFull && pageImages.length > 0 ? (
        <div className="rounded-xl overflow-hidden ring-1 ring-foreground/10">
          <FlipBookViewer pages={pageImages} title={script.title} />
        </div>
      ) : (
        <AccessSection canViewFull={canViewFull} pdfUrl={pdfUrl} viewFullLabel={t("viewFull")} needAccessLabel={t("needAccess")} />
      )}
    </div>
  )
}

/* ---------- Sub-components (keep file compact) ---------- */

function CoverImage({ url, title }: { url: string | null; title: string }) {
  if (url) {
    return (
      <Image
        src={url}
        alt={title}
        width={900}
        height={1200}
        unoptimized={url.startsWith("https://")}
        sizes="(min-width: 1024px) 32rem, 100vw"
        className="aspect-[3/4] w-full rounded-xl object-cover"
      />
    )
  }
  return (
    <div className="aspect-[3/4] w-full bg-gradient-to-br from-primary/20 to-primary/5 rounded-xl flex items-center justify-center p-8">
      <span className="text-2xl font-bold text-foreground/50 text-center leading-tight">{title}</span>
    </div>
  )
}

function TagSection({ genreTags, themeTags, locale }: { genreTags?: string[]; themeTags?: string[]; locale: string }) {
  const hasGenre = genreTags && genreTags.length > 0
  const hasTheme = themeTags && themeTags.length > 0
  if (!hasGenre && !hasTheme) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {genreTags?.map((g) => <TagBadge key={g} label={localizeTag(g, locale)} />)}
      {themeTags?.map((g) => <TagBadge key={g} label={localizeTag(g, locale)} variant="secondary" />)}
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

  if (canViewFull) return null

  return (
    <div className="flex items-center gap-2 rounded-xl bg-muted p-4 text-sm text-muted-foreground">
      <Lock className="size-4 shrink-0" />
      <span>{needAccessLabel}</span>
    </div>
  )
}

function plainText(value: string) {
  return value.replace(/<[^>]*>/g, "").trim()
}
