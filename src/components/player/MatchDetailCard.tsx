"use client"

import Link from "next/link"
import { MessageSquare, CheckCircle } from "lucide-react"
import { useLocale } from "next-intl"
import { TagBadge } from "@/components/shared/TagBadge"
import { localizeTag } from "@/lib/constants/tags-i18n"

interface PartnerProfile {
  name: string
  hobbyTags: string[]
  gameTypePref: string | null
  scenarioThemeTags: string[]
  expressionStyleTags: string[]
  groupRoleTags: string[]
}

interface Props {
  partner: PartnerProfile
  sessionName: string
  reviewed: boolean
  matchId: string
  t: (key: string) => string
}

export function MatchDetailCard({ partner, sessionName, reviewed, matchId, t }: Props) {
  const locale = useLocale()
  const tagGroups = buildTagList(partner, t, locale)

  return (
    <div className="rounded-xl bg-card p-5 shadow-soft space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-base font-semibold">
            {t("partner")}: {partner.name || t("unknown")}
          </p>
          {sessionName && (
            <p className="text-xs text-muted-foreground mt-0.5">{sessionName}</p>
          )}
        </div>
        {reviewed ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <CheckCircle className="size-3.5" /> {t("reviewed")}
          </span>
        ) : (
          <Link
            href={`/app/reviews/new/${matchId}`}
            className="inline-flex items-center gap-1 rounded-full bg-sakura/10 px-3 py-1 text-xs font-medium text-sakura hover:bg-sakura/20 transition-colors"
          >
            <MessageSquare className="size-3.5" /> {t("review")}
          </Link>
        )}
      </div>

      {tagGroups.length > 0 && (
        <div className="space-y-2">
          {tagGroups.map((group) => (
            <div key={group.label}>
              <p className="text-[11px] text-muted-foreground mb-1">{group.label}</p>
              <div className="flex flex-wrap gap-1">
                {group.tags.map((tag) => (
                  <TagBadge key={tag} label={tag} variant={group.variant} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

type TagVariant = "default" | "secondary" | "outline" | "success" | "warning" | "danger" | "info"

function buildTagList(p: PartnerProfile, t: (k: string) => string, locale: string) {
  const groups: { label: string; tags: string[]; variant: TagVariant }[] = []
  const l = (tag: string) => localizeTag(tag, locale)

  if (p.hobbyTags.length > 0) {
    groups.push({ label: t("interests"), tags: p.hobbyTags.slice(0, 5).map(l), variant: "info" })
  }
  const social = [...p.expressionStyleTags, ...p.groupRoleTags]
  if (social.length > 0) {
    groups.push({ label: t("socialStyle"), tags: social.slice(0, 4).map(l), variant: "secondary" })
  }
  const game: string[] = []
  if (p.gameTypePref) game.push(p.gameTypePref)
  game.push(...p.scenarioThemeTags.slice(0, 3))
  if (game.length > 0) {
    groups.push({ label: t("gameType"), tags: game.map(l), variant: "outline" })
  }
  return groups
}
