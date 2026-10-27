"use client"

import { useRouter } from "next/navigation"
import { MessageSquare, CheckCircle } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { TagBadge } from "@/components/shared/TagBadge"
import { localizeTag } from "@/lib/constants/tags-i18n"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

interface PartnerProfile {
  name: string
  hobbyTags: string[]
  gameTypePref: string | null
  scenarioThemeTags: string[]
  expressionStyleTags: string[]
  groupRoleTags: string[]
}

interface Labels {
  partner: string
  unknown: string
  interests: string
  socialStyle: string
  gameType: string
  review: string
  reviewed: string
  groupMembers?: string
  recommendedTime?: string
  matchEnded?: string
}

interface Props {
  partner: PartnerProfile
  sessionName: string
  reviewed: boolean
  matchId: string
  isGroup?: boolean
  groupMemberNames?: string[]
  recommendedTime?: string
  ended?: boolean
  labels: Labels
}

export function MatchDetailCard({ partner, sessionName, reviewed, matchId, isGroup, groupMemberNames, recommendedTime, ended, labels }: Props) {
  const locale = useLocale()
  const t = useTranslations("playerMatches")
  const router = useRouter()
  const tagGroups = buildTagList(partner, labels, locale)

  return (
    <div className="rounded-xl bg-card p-5 shadow-soft space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-base font-semibold">
            {isGroup ? `🎲 ${partner.name}` : `${labels.partner}: ${partner.name || labels.unknown}`}
          </p>
          {sessionName && (
            <p className="text-xs text-muted-foreground mt-0.5">{sessionName}</p>
          )}
          {recommendedTime && <p className="text-xs text-muted-foreground mt-1">{labels.recommendedTime}：{recommendedTime}</p>}
          {isGroup && groupMemberNames && groupMemberNames.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {labels.groupMembers ?? "组员"}：{groupMemberNames.join("、")}
            </p>
          )}
        </div>
        {ended ? <span className="text-xs text-muted-foreground">{labels.matchEnded}</span> : reviewed ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <CheckCircle className="size-3.5" /> {labels.reviewed}
          </span>
        ) : (
          <Dialog>
            <DialogTrigger className="inline-flex items-center gap-1 rounded-full bg-sakura/10 px-3 py-1 text-xs font-medium text-sakura hover:bg-sakura/20 transition-colors">
              <MessageSquare className="size-3.5" /> {labels.review}
            </DialogTrigger>
            <DialogContent showCloseButton={false}>
              <DialogTitle>{t("reviewAfterActivityPrompt")}</DialogTitle>
              <div className="grid gap-3 sm:grid-cols-2">
                <DialogClose render={<Button variant="outline" />}>
                  {t("reviewAfterActivityCancel")}
                </DialogClose>
                <DialogClose render={<Button onClick={() => router.push(`/app/reviews/new/${matchId}`)} />}>
                  {t("reviewAfterActivityConfirm")}
                </DialogClose>
              </div>
            </DialogContent>
          </Dialog>
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

function buildTagList(p: PartnerProfile, labels: Labels, locale: string) {
  const groups: { label: string; tags: string[]; variant: TagVariant }[] = []
  const l = (tag: string) => localizeTag(tag, locale)

  if (p.hobbyTags.length > 0) {
    groups.push({ label: labels.interests, tags: p.hobbyTags.slice(0, 5).map(l), variant: "secondary" })
  }
  const social = [...p.expressionStyleTags, ...p.groupRoleTags]
  if (social.length > 0) {
    groups.push({ label: labels.socialStyle, tags: social.slice(0, 4).map(l), variant: "secondary" })
  }
  const game: string[] = []
  if (p.gameTypePref) game.push(p.gameTypePref)
  game.push(...p.scenarioThemeTags.slice(0, 3))
  if (game.length > 0) {
    groups.push({ label: labels.gameType, tags: game.map(l), variant: "outline" })
  }
  return groups
}
