import { CheckCircle2 } from "lucide-react"
import Link from "next/link"
import { getLocale, getTranslations } from "next-intl/server"
import { requirePlayer } from "@/lib/auth/player"
import { fetchMyProfileSummary } from "@/lib/profile/queries"
import { loadMyProfileDetails, requireProfileReader } from "@/lib/profile/details-query"
import { buildProfileDetailSections } from "@/lib/profile/details"
import { ProfileDetailsCard } from "@/components/player/profile/ProfileDetailsCard"
import { ProfileMenuCard } from "@/components/player/profile/ProfileMenuCard"
import { ProfileSettingsCard } from "@/components/player/profile/ProfileSettingsCard"
import { ProfileSummaryCard } from "@/components/player/profile/ProfileSummaryCard"

interface ProfilePageProps {
  searchParams: Promise<{ profile_updated?: string }>
}

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const player = await requireProfileReader()
  const detailsPromise = loadMyProfileDetails()
  const [locale, detailsT] = await Promise.all([getLocale(), getTranslations("profile.details")])

  if (player.status !== "approved") {
    const details = await detailsPromise
    return (
      <div className="space-y-4 px-4 pb-7 pt-4">
        <h1 className="heading-display text-2xl font-semibold">{detailsT("submittedTitle")}</h1>
        <p className="text-sm leading-6 text-muted-foreground">{detailsT("submittedHint")}</p>
        {details ? (
          <ProfileDetailsCard
            title={detailsT("title")}
            hint={detailsT("hint")}
            sections={buildProfileDetailSections(details, locale, detailsT).filter((section) => section.key === "identity")}
          />
        ) : <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{detailsT("loadFailed")}</p>}
        <Link href="/app" className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-primary">{detailsT("backToApp")}</Link>
      </div>
    )
  }

  await requirePlayer()
  const [profile, t, params, details] = await Promise.all([
    fetchMyProfileSummary(),
    getTranslations("profile"),
    searchParams,
    detailsPromise,
  ])

  const personalStatus = profile.identityComplete
    ? t("status.profileComplete")
    : t("status.profilePending")

  return (
    <div className="space-y-3 px-4 pb-7 pt-3">
      <h1 className="heading-display text-[2rem] font-semibold leading-tight tracking-tight">{t("title")}</h1>

      {params.profile_updated === "1" && (
        <div role="status" className="flex min-h-11 items-center gap-2 rounded-xl bg-primary/10 px-3 text-sm font-medium text-primary">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          <span>{t("updated")}</span>
        </div>
      )}

      <ProfileSummaryCard
        avatarUrl={profile.personalAvatarUrl}
        nickname={profile.nickname}
        fullName={profile.fullName}
        schoolName={profile.schoolName}
        memberNumber={profile.memberNumber}
        levelLabel={t(`levels.${profile.level}`)}
        matchScore={profile.compatibilityScore}
        activityCount={profile.activityCount}
        labels={{
          nicknameUnset: t("nicknameUnset"),
          schoolUnset: t("schoolUnset"),
          memberNumber: t("number"),
          memberNumberPending: t("memberNumberPending"),
          level: t("level"),
          matchScore: t("matchScore"),
          activities: t("activities"),
          matchScorePending: t("matchScorePending"),
          activityUnit: t("activityUnit"),
          editProfile: t("editProfileAria"),
        }}
      />

      <ProfileMenuCard
        labels={{
          personalProfile: t("menu.personalProfile"),
          communityManagement: t("menu.communityManagement"),
          supplementary: t("menu.supplementary"),
          personalitySelf: t("menu.personalitySelf"),
          personalityTest: t("menu.personalityTest"),
        }}
        statuses={{
          personalProfile: personalStatus,
          community: profile.communityProfileId ? t("status.communitySet") : t("status.communityUnset"),
          supplementary: profile.supplementaryComplete ? t("status.completed") : t("status.supplementaryPending"),
          personality: profile.personalityComplete ? t("status.completed") : t("status.personalityPending"),
          quiz: profile.quizComplete ? t("status.completed") : t("status.quizPending"),
        }}
      />

      {details ? (
        <ProfileDetailsCard
          title={detailsT("title")}
          hint={detailsT("hint")}
          sections={buildProfileDetailSections(details, locale, detailsT)}
        />
      ) : <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{detailsT("loadFailed")}</p>}

      <ProfileSettingsCard
        lineUserId={profile.lineUserId}
        labels={{
          language: t("language"),
          languageZh: t("languageZh"),
          languageJa: t("languageJa"),
          logout: t("logout"),
          logoutConfirm: t("logoutConfirm"),
        }}
      />
    </div>
  )
}
