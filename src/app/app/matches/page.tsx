import { getTranslations, getLocale } from "next-intl/server"
import { requirePlayer } from "@/lib/auth/player"
import { fetchPlayerMatches } from "@/lib/queries/matching"
import { fetchPlayerMatchHistory } from "@/lib/queries/player-history"
import { fetchReviewedMatchIds } from "@/lib/queries/reviews"
import { fetchGroupMemberNames } from "@/lib/queries/group-members"
import { fetchPlayerParticipationRecords } from "@/lib/queries/player-participation"
import { PlayerMatchesSection } from "@/components/player/matches/PlayerMatchesSection"
import { PlayerParticipationRecords } from "@/components/player/profile/PlayerParticipationRecords"
import { fetchMyActivityReviewRounds } from "@/lib/activity-reviews/queries"

export default async function PlayerMatchesPage() {
  const player = await requirePlayer()
  const [t, locale, matches, history, reviewedIds, participation, reviewRounds] = await Promise.all([
    getTranslations("playerMatches"),
    getLocale(),
    fetchPlayerMatches(player.memberId),
    fetchPlayerMatchHistory(player.memberId),
    fetchReviewedMatchIds(player.memberId),
    fetchPlayerParticipationRecords(player.memberId),
    fetchMyActivityReviewRounds(),
  ])
  const labels = {
    partner: t("partner"), interests: t("interests"), socialStyle: t("socialStyle"),
    gameType: t("gameType"), review: t("review"), reviewed: t("reviewed"),
    cancelBadgePending: t("cancelBadgePending"), cancelBadgeApproved: t("cancelBadgeApproved"),
    cancelBadgeRejected: t("cancelBadgeRejected"), matchEnded: t("matchEnded"),
  }
  const allGroupIds = new Set<string>()
  for (const match of [...matches, ...history]) {
    if (Array.isArray(match.group_members)) {
      for (const id of match.group_members) if (id !== player.memberId) allGroupIds.add(id)
    }
  }
  const groupNames = await fetchGroupMemberNames([...allGroupIds])

  return <div className="space-y-6 px-4 pb-7 pt-6">
    <header>
      <h1 className="heading-display text-[2rem] font-semibold leading-tight tracking-tight">{t("pageTitle")}</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("pageDescription")}</p>
    </header>
    <PlayerMatchesSection
      matches={matches} history={history} memberId={player.memberId}
      nameMap={new Map(groupNames.map((member) => [member.id, member.name]))}
      reviewedIds={reviewedIds} dateFmt={locale === "ja" ? "ja-JP" : "zh-CN"} labels={labels}
      copy={{ title: t("matchingTitle"), description: t("matchingDescription"), empty: t("matchingEmpty"), historyTitle: t("historyTitle") }}
    />
    <PlayerParticipationRecords records={participation} reviewRounds={reviewRounds} initialNow={new Date().toISOString()} />
  </div>
}
