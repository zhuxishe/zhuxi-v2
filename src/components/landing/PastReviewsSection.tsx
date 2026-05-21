import { getLocale, getTranslations } from "next-intl/server"
import { Images } from "lucide-react"
import { PastReviewCard } from "@/components/landing/PastReviewCard"
import { PastReviewsQuickNav } from "@/components/landing/PastReviewsQuickNav"
import { getLandingEventReviews } from "@/lib/landing-activity-photos"
import { fetchPublishedPastEventReviews } from "@/lib/queries/past-event-reviews"

export async function PastReviewsSection() {
  const t = await getTranslations("pastReviews")
  const landingEventReviews = getLandingEventReviews(await getLocale())
  const dbReviews = await fetchPublishedPastEventReviews()
  const reviews = [...landingEventReviews, ...dbReviews]

  return (
    <section className="relative min-h-screen bg-[#fffdf7] px-5 pb-16 pt-24 text-[#171717] grain-overlay md:pb-20 md:pt-32">
      <div className="container mx-auto max-w-6xl">
        <div className="mb-5 rounded-[1.6rem] border border-[#e5dfd3] bg-white/88 p-5 shadow-[0_16px_42px_rgba(44,55,35,0.10)] md:mb-9 md:rounded-[2rem] md:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6b8f4e]">{t("kicker")}</p>
          <h1 className="mt-3 font-display text-3xl font-bold leading-tight md:mt-4 md:text-5xl">{t("title")}</h1>
          <div className="mt-2 h-2 w-32 rounded-[50%] border-b-[6px] border-[#f3cf55] md:mt-3 md:w-40" />
          <p className="mt-4 max-w-xl text-sm leading-[1.8] text-[#4c5148] md:mt-5 md:text-base">{t("subtitle")}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-[#5f8549] md:mt-6">
            <span className="rounded-full bg-[#edf4e7] px-4 py-2">{t("chipPhotos")}</span>
            <span className="rounded-full bg-[#fff4c7] px-4 py-2">{t("chipOffline")}</span>
            <span className="rounded-full bg-[#edf4e7] px-4 py-2">{t("chipFriendly")}</span>
          </div>
        </div>

        {reviews.length === 0 ? (
          <div className="landing-card bg-white p-10 text-center">
            <Images className="mx-auto mb-4 size-9 text-bamboo" />
            <p className="font-display text-lg text-muted-foreground">{t("empty")}</p>
          </div>
        ) : (
          <>
            <PastReviewsQuickNav reviews={reviews} />
            <div className="space-y-5">
              {reviews.map((review) => (
                <PastReviewCard key={review.id} review={review} sourceLabel={t("source")} photoUnitLabel={t("photoUnit")} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
