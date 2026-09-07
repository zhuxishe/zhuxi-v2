import { getLocale, getTranslations } from "next-intl/server"
import { requirePlayer } from "@/lib/auth/player"
import { fetchMyProfileSummary } from "@/lib/profile/queries"
import { ProfileEditForm } from "@/components/player/profile/ProfileEditForm"
import { ProfileDetailRows } from "@/components/player/profile/ProfileDetailsCard"
import { loadMyProfileDetails } from "@/lib/profile/details-query"
import { buildProfileDetailRows, REGISTRATION_READONLY_FIELDS } from "@/lib/profile/details"

export default async function ProfileEditPage() {
  await requirePlayer()
  const [profile, t, details, detailsT, locale] = await Promise.all([
    fetchMyProfileSummary(),
    getTranslations("profile.edit"),
    loadMyProfileDetails(),
    getTranslations("profile.details"),
    getLocale(),
  ])

  return (
    <>
      <style>{`
        .player-app-theme:has(.player-profile-edit-screen) {
          padding-bottom: 0;
        }
        .player-app-theme:has(.player-profile-edit-screen) > .player-top-header,
        .player-app-theme:has(.player-profile-edit-screen) > .player-bottom-nav {
          display: none;
        }
      `}</style>
      <ProfileEditForm
        registrationDetails={
          <section className="rounded-[22px] border border-border/90 bg-card p-4 shadow-soft">
            <h2 className="text-sm font-semibold">{detailsT("registrationTitle")}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{detailsT("registrationHint")}</p>
            {details ? (
              <ProfileDetailRows rows={buildProfileDetailRows(details.identity, REGISTRATION_READONLY_FIELDS, locale, detailsT)} />
            ) : <p role="alert" className="mt-3 text-sm text-destructive">{detailsT("loadFailed")}</p>}
          </section>
        }
        initial={{
          fullName: profile.fullName,
          gender: profile.gender,
          nickname: profile.nickname,
          schoolName: profile.schoolName,
          department: profile.department,
          email: profile.email,
          memberNumber: profile.memberNumber,
          personalAvatarPath: profile.personalAvatarPath,
          personalAvatarUrl: profile.personalAvatarUrl,
        }}
        labels={{
          title: t("title"),
          back: t("back"),
          save: t("save"),
          saving: t("saving"),
          avatar: t("avatar"),
          changeAvatar: t("changeAvatar"),
          removeAvatar: t("removeAvatar"),
          avatarHint: t("avatarHint"),
          avatarTooLarge: t("avatarTooLarge"),
          cropTitle: t("cropTitle"),
          cropHint: t("cropHint"),
          cropFallback: t("cropFallback"),
          cropZoom: t("cropZoom"),
          cancel: t("cancel"),
          usePhoto: t("usePhoto"),
          uploading: t("uploading"),
          uploadFailed: t("uploadFailed"),
          fullName: t("fullName"),
          gender: t("gender"),
          male: t("male"),
          female: t("female"),
          other: t("other"),
          nickname: t("nickname"),
          optional: t("optional"),
          nicknamePlaceholder: t("nicknamePlaceholder"),
          schoolName: t("schoolName"),
          schoolPlaceholder: t("schoolPlaceholder"),
          department: t("department"),
          departmentPlaceholder: t("departmentPlaceholder"),
          basicInfo: t("basicInfo"),
          accountInfo: t("accountInfo"),
          accountHint: t("accountHint"),
          email: t("email"),
          memberNumber: t("memberNumber"),
          emailMissing: t("emailMissing"),
          memberNumberPending: t("memberNumberPending"),
          required: t("required"),
          tooLong: t("tooLong"),
          nicknameLength: t("nicknameLength"),
          nicknameUnavailable: t("nicknameUnavailable"),
          nicknameReserved: t("nicknameReserved"),
          nicknameCommunityRequired: t("nicknameCommunityRequired"),
          saveFailed: t("saveFailed"),
          unsavedConfirm: t("unsavedConfirm"),
        }}
      />
    </>
  )
}
