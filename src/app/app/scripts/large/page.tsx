import { getLocale, getTranslations } from "next-intl/server"
import { requirePlayer } from "@/lib/auth/player"
import { fetchPlayerLargeActivityLibrary } from "@/lib/player-activity/queries"
import { ActivityPageIntro } from "@/components/player/activity/ActivityPageIntro"
import { ActivitySectionHeader } from "@/components/player/activity/ActivitySectionHeader"
import { LargeActivityCard } from "@/components/player/activity/LargeActivityCard"

export default async function LargeActivityLibraryPage() {
  await requirePlayer()
  const [locale, t] = await Promise.all([
    getLocale(),
    getTranslations("activity"),
  ])
  const sections = await fetchPlayerLargeActivityLibrary(locale)
  const labels = {
    upcoming: t("badges.upcoming"),
    latest: t("badges.latest"),
    cancelled: t("badges.cancelled"),
    datePending: t("datePending"),
    locationPending: t("locationPending"),
  }

  return (
    <div className="space-y-7 px-4 pb-7 pt-3">
      <ActivityPageIntro
        title={t("largeLibraryTitle")}
        description={t("largeLibrarySubtitle")}
        backHref="/app/scripts"
        backLabel={t("backToActivity")}
      />

      <section>
        <ActivitySectionHeader title={t("upcomingTitle")} />
        {sections.upcoming.length > 0 ? (
          <div className="space-y-3">
            {sections.upcoming.map((activity, index) => (
              <LargeActivityCard key={activity.id} activity={activity} labels={labels} locale={locale} compact priority={index === 0} />
            ))}
          </div>
        ) : <LibraryEmpty label={t("noUpcoming")} />}
      </section>

      <section>
        <ActivitySectionHeader title={t("latestTitle")} />
        {sections.latest.length > 0 ? (
          <div className="space-y-3">
            {sections.latest.map((activity, index) => (
              <LargeActivityCard key={activity.id} activity={activity} labels={labels} locale={locale} compact priority={sections.upcoming.length === 0 && index === 0} />
            ))}
          </div>
        ) : <LibraryEmpty label={t("noLatest")} />}
      </section>
    </div>
  )
}

function LibraryEmpty({ label }: { label: string }) {
  return <p className="rounded-[20px] border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground shadow-soft">{label}</p>
}
