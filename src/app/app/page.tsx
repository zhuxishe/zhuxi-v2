import { redirect } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { getPlayerInfo } from "@/lib/auth/player"
import { resolvePlayerRoute } from "@/lib/auth/routing"
import { fetchPlayerRounds, fetchSubmittedRoundIds } from "@/lib/queries/player-rounds"
import { getRoundPurpose, localizeRoundText, normalizeRoundConfig } from "@/lib/matching/round-config"
import { roundCardCopy, roundDisplayName, roundHref, selectHomeRound } from "@/lib/matching/round-display"
import { fetchMyProfileSummary } from "@/lib/profile/queries"
import { fetchPlayerActivityHub } from "@/lib/player-activity/queries"
import { isUpcomingLargeActivity } from "@/lib/player-activity/selection"
import { fetchPublishedAnnouncements } from "@/lib/community/queries/official"
import { normalizeCommunityLocale } from "@/lib/community/localize"
import { PlayerPendingView } from "@/components/player/PlayerPendingView"
import { PlayerHomeSurveyAction } from "@/components/player/home/PlayerHomeSurveyAction"
import { PlayerHomeAnnouncements } from "@/components/player/home/PlayerHomeAnnouncements"
import { PlayerHomeFeaturedActivity } from "@/components/player/home/PlayerHomeFeaturedActivity"
import { PlayerHomeQuickActions } from "@/components/player/home/PlayerHomeQuickActions"
import { PlayerHomeStatus } from "@/components/player/home/PlayerHomeStatus"
import type { PlayerHomeAction } from "@/components/player/home/types"
import { fetchMyActivityReviewRounds } from "@/lib/activity-reviews/queries"
import { activityReviewCopy } from "@/lib/activity-reviews/copy"

export default async function PlayerHomePage() {
  const player = await getPlayerInfo()
  const route = resolvePlayerRoute(player ? {
    status: player.status,
    accountStatus: player.accountStatus,
    membershipType: player.membershipType,
    profileStage: player.profileStage,
    onboardingStep: player.onboardingStep,
    hasIdentity: player.hasIdentity,
  } : null)

  if (route.action === "redirect") return redirect(route.to)
  if (route.view === "pending") return <PlayerPendingView />
  if (route.view === "rejected") return <PlayerPendingView rejected />

  const approvedPlayer = player!
  const locale = await getLocale()
  const [t, profileT, roundT, profile, rounds, activityData, announcements, reviewRounds] = await Promise.all([
    getTranslations("playerHome"),
    getTranslations("profile"),
    getTranslations("rounds"),
    fetchMyProfileSummary(),
    fetchPlayerRounds(),
    fetchPlayerActivityHub(locale, new Date(), { largeLimit: 200 }),
    fetchHomeAnnouncements(locale),
    fetchMyActivityReviewRounds(),
  ])

  const submittedIds = await fetchSubmittedRoundIds(approvedPlayer.memberId, rounds.map((round) => round.id))
  const openRound = selectHomeRound(rounds, submittedIds)
  const hasSubmitted = Boolean(openRound && submittedIds.includes(openRound.id))
  const purpose = getRoundPurpose(openRound?.purpose)
  const surveyCopy = purpose === "matching" ? {
    title: t("action.survey.title"), description: t("action.survey.description"), cta: t("action.survey.cta"),
  } : {
    title: roundT(`purpose.${purpose}`), description: roundT(`description.${purpose}`), cta: roundT(`cta.${purpose}`),
  }
  // Remind once per activity: any submitted rating or report satisfies the reminder.
  const reviewCopy = activityReviewCopy(locale)
  const pendingReviewCount = reviewRounds.filter((round) => round.status === "open" && round.canReview && !round.hasSubmittedFeedback && round.reviewedCount === 0).length
  const pendingReviewHref = "/app/matches#participation"
  const recruitingActivities = activityData.largeActivities.filter((activity) => isUpcomingLargeActivity(activity)).slice(0, 3)
  const priorityActivityId = recruitingActivities[0]?.id ?? null
  const actionInput = {
    labels: {
      eyebrow: t("action.eyebrow"),
      review: {
        title: reviewCopy.openActivities(pendingReviewCount),
        description: reviewCopy.homeDescription,
        cta: reviewCopy.homeCta,
      },
      survey: openRound ? roundCardCopy(openRound, locale, surveyCopy) : surveyCopy,
      profile: {
        title: t("action.profile.title"),
        description: t("action.profile.description"),
        cta: t("action.profile.cta"),
      },
      activity: {
        title: t("action.activity.title"),
        description: t("action.activity.description"),
        cta: t("action.activity.cta"),
      },
      explore: {
        title: t("action.explore.title"),
        description: t("action.explore.description"),
        cta: t("action.explore.cta"),
      },
    },
    pendingReviewCount,
    pendingReviewHref,
    openRound: Boolean(openRound),
    surveyHref: openRound ? roundHref(openRound.id) : "/app/matching/survey",
    hasSubmitted,
    profile,
    featuredId: priorityActivityId,
    fallbackScriptId: activityData.socialScripts[0]?.id ?? null,
  }
  const action = resolvePrimaryAction(actionInput)
  const fallbackAction = resolvePrimaryAction({ ...actionInput, openRound: false })
  const featured = recruitingActivities.find((activity) => action.href !== `/app/scripts/large/${activity.id}`) ?? null
  const displayName = profile.nickname || approvedPlayer.name || profile.fullName

  return (
    <div className="px-[22px] pb-7 pt-[27px]">
      <header>
        <h1 className="text-[1.65rem] font-semibold leading-tight tracking-tight">
          {t(`greeting.${greetingPeriod()}`, { name: displayName })}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("greeting.subtitle")}</p>
        {profile.memberNumber ? (
          <p className="mt-1 text-xs text-muted-foreground">{profileT("memberNumberValue", { number: profile.memberNumber })}</p>
        ) : null}
      </header>

      <div className="mt-[10px]">
        <PlayerHomeSurveyAction
          action={action}
          fallbackAction={fallbackAction}
          round={openRound ? { id: openRound.id, status: openRound.status, survey_start: openRound.survey_start, survey_end: openRound.survey_end } : null}
          initialNow={new Date().toISOString()}
        />
      </div>

      <div className="mt-6">
        <PlayerHomeQuickActions
          rounds={rounds.map((round) => {
            const config = normalizeRoundConfig(round.content_config)
            return {
              id: round.id,
              title: roundDisplayName(round, locale),
              purpose: getRoundPurpose(round.purpose),
              status: round.status,
              survey_start: round.survey_start,
              survey_end: round.survey_end,
              submitted: submittedIds.includes(round.id),
              eventStart: config.eventStart,
              location: localizeRoundText(config.location, locale),
            }
          })}
          initialNow={new Date().toISOString()}
          activities={recruitingActivities.map((activity) => ({
            id: activity.id,
            title: activity.title,
            coverUrl: activity.coverUrl,
            startAt: activity.startAt,
            eventDate: activity.eventDate,
            location: activity.location,
          }))}
          locale={locale}
          pendingReviewCount={pendingReviewCount}
          pendingReviewHref={pendingReviewHref}
          labels={{
            ariaLabel: t("quick.ariaLabel"),
            recruiting: t("quick.recruiting"),
            reviews: reviewCopy.quick,
            history: t("quick.history"),
            feedback: t("quick.feedback"),
            recruitingSheet: {
              title: t("recruiting.title"),
              description: t("recruiting.description"),
              empty: t("recruiting.empty"),
              viewAll: t("recruiting.viewAll"),
              roundsTitle: t("recruiting.roundsTitle"),
              announcementsTitle: t("recruiting.announcementsTitle"),
              activitiesTitle: t("recruiting.activitiesTitle"),
              viewRounds: t("recruiting.viewRounds"),
              datePending: t("common.datePending"),
              locationPending: t("common.locationPending"),
              close: t("common.close"),
            },
            feedbackDialog: {
              title: t("feedback.title"),
              description: t("feedback.description"),
              category: t("feedback.category"),
              categories: {
                product: t("feedback.categories.product"),
                activity: t("feedback.categories.activity"),
                matching: t("feedback.categories.matching"),
                community: t("feedback.categories.community"),
                other: t("feedback.categories.other"),
              },
              content: t("feedback.content"),
              placeholder: t("feedback.placeholder"),
              counter: t("feedback.counter", { count: "{count}" }),
              submit: t("feedback.submit"),
              submitting: t("feedback.submitting"),
              successTitle: t("feedback.successTitle"),
              successDescription: t("feedback.successDescription"),
              done: t("feedback.done"),
              close: t("common.close"),
            },
          }}
        />
      </div>

      <div className="mt-8">
        <PlayerHomeStatus
          title={t("status.title")}
          compatibility={{
            label: t("status.compatibility"),
            value: profile.compatibilityStatus === "published" && profile.compatibilityScore != null
              ? t("status.scoreValue", { score: profile.compatibilityScore.toFixed(1) })
              : t("status.scorePending"),
            hint: profile.compatibilityStatus === "published" ? t("status.viewProfile") : t("status.viewMatches"),
            href: profile.compatibilityStatus === "published" ? "/app/profile" : "/app/matches#matching",
          }}
          growth={{
            label: t("status.growth"),
            value: profileT(`levels.${profile.level}`),
            hint: t("status.activityCount", { count: profile.activityCount }),
            href: "/app/profile/stats",
          }}
        />
      </div>

      {featured && (
        <div className="mt-6">
          <PlayerHomeFeaturedActivity
            activity={{
              id: featured.id,
              title: featured.title,
              coverUrl: featured.coverUrl,
              startAt: featured.startAt,
              eventDate: featured.eventDate,
              location: featured.location,
            }}
            locale={locale}
            labels={{
              title: t("featured.title"),
              badge: t("featured.badge"),
              viewAll: t("featured.viewAll"),
              viewDetail: t("featured.viewDetail"),
              datePending: t("common.datePending"),
              locationPending: t("common.locationPending"),
            }}
          />
        </div>
      )}

      {announcements.length > 0 && (
        <div className="mt-5">
          <PlayerHomeAnnouncements
            title={t("announcements.title")}
            items={announcements.map((announcement) => ({ id: announcement.id, title: announcement.title }))}
          />
        </div>
      )}
    </div>
  )
}

function resolvePrimaryAction({
  labels,
  pendingReviewCount,
  pendingReviewHref,
  openRound,
  surveyHref,
  hasSubmitted,
  profile,
  featuredId,
  fallbackScriptId,
}: {
  labels: {
    eyebrow: string
    review: ActionCopy
    survey: ActionCopy
    profile: ActionCopy
    activity: ActionCopy
    explore: ActionCopy
  }
  pendingReviewCount: number
  pendingReviewHref: string
  openRound: boolean
  surveyHref: string
  hasSubmitted: boolean
  profile: Awaited<ReturnType<typeof fetchMyProfileSummary>>
  featuredId: string | null
  fallbackScriptId: string | null
}): PlayerHomeAction {
  if (pendingReviewCount > 0) return {
    eyebrow: labels.eyebrow,
    title: labels.review.title,
    description: labels.review.description,
    href: pendingReviewHref,
    cta: labels.review.cta,
  }
  if (openRound && !hasSubmitted) return {
    eyebrow: labels.eyebrow,
    title: labels.survey.title,
    description: labels.survey.description,
    href: surveyHref,
    cta: labels.survey.cta,
  }
  const incomplete = resolveIncompleteProfile(profile)
  if (incomplete) return {
    eyebrow: labels.eyebrow,
    title: labels.profile.title,
    description: labels.profile.description,
    href: incomplete,
    cta: labels.profile.cta,
  }
  if (featuredId) return {
    eyebrow: labels.eyebrow,
    title: labels.activity.title,
    description: labels.activity.description,
    href: `/app/scripts/large/${featuredId}`,
    cta: labels.activity.cta,
  }
  return {
    eyebrow: labels.eyebrow,
    title: labels.explore.title,
    description: labels.explore.description,
    href: fallbackScriptId ? `/app/scripts/${fallbackScriptId}` : "/app/scripts",
    cta: labels.explore.cta,
  }
}

interface ActionCopy {
  title: string
  description: string
  cta: string
}

function resolveIncompleteProfile(profile: Awaited<ReturnType<typeof fetchMyProfileSummary>>) {
  if (!profile.identityComplete) return "/app/profile/edit"
  if (!profile.supplementaryComplete) return "/app/profile/supplementary"
  if (!profile.personalityComplete) return "/app/profile/personality"
  if (!profile.quizComplete) return "/app/profile/quiz"
  return null
}

function greetingPeriod() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    hour12: false,
  }).format(new Date()))
  if (hour < 11) return "morning"
  if (hour < 18) return "afternoon"
  return "evening"
}

async function fetchHomeAnnouncements(locale: string) {
  try {
    return await fetchPublishedAnnouncements(normalizeCommunityLocale(locale), { limit: 2, pinnedOnly: true })
  } catch (error) {
    console.warn("[player home announcements unavailable]", error)
    return []
  }
}
