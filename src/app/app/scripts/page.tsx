import { getLocale, getTranslations } from "next-intl/server"
import { requirePlayer } from "@/lib/auth/player"
import { fetchPlayerActivityHub } from "@/lib/player-activity/queries"
import { ActivityPageIntro } from "@/components/player/activity/ActivityPageIntro"
import { ActivitySectionHeader } from "@/components/player/activity/ActivitySectionHeader"
import { LargeActivityCard } from "@/components/player/activity/LargeActivityCard"
import { ScriptLibraryEntry } from "@/components/player/activity/ScriptLibraryEntry"
import { SocialScriptShelf } from "@/components/player/activity/SocialScriptCards"

export default async function PlayerActivityPage() {
  await requirePlayer()
  const [locale, t] = await Promise.all([
    getLocale(),
    getTranslations("activity"),
  ])
  const data = await fetchPlayerActivityHub(locale)
  const cardLabels = {
    upcoming: t("badges.upcoming"),
    latest: t("badges.latest"),
    cancelled: t("badges.cancelled"),
    datePending: t("datePending"),
    locationPending: t("locationPending"),
  }

  return (
    <div className="space-y-3.5 px-4 pb-4 pt-2.5">
      <ActivityPageIntro title={t("title")} description={t("subtitle")} />

      <section>
        <ActivitySectionHeader title={t("largeTitle")} href="/app/scripts/large" actionLabel={t("viewAll")} />
        {data.largeActivities.length > 0 ? (
          <div className="space-y-2.5">
            {data.largeActivities.map((activity, index) => (
              <LargeActivityCard
                key={activity.id}
                activity={activity}
                labels={cardLabels}
                locale={locale}
                compact
                priority={index === 0}
              />
            ))}
          </div>
        ) : (
          <ActivityEmptyState label={t("emptyLarge")} />
        )}
      </section>

      <section>
        <ActivitySectionHeader title={t("socialTitle")} href="/app/scripts/social" actionLabel={t("viewAll")} />
        <SocialScriptShelf scripts={data.socialScripts} locale={locale} emptyLabel={t("emptySocial")} />
      </section>

      <ScriptLibraryEntry title={t("libraryTitle")} description={t("libraryDescription")} />
    </div>
  )
}

function ActivityEmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-[22px] border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground shadow-soft">
      {label}
    </div>
  )
}
