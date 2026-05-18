import Link from "next/link"
import { getLocale, getTranslations } from "next-intl/server"
import { ExternalLink, Images } from "lucide-react"
import { cssImageUrl } from "@/lib/css-image-url"
import { getLandingEventReviews } from "@/lib/landing-activity-photos"
import { fetchPublishedPastEventReviews } from "@/lib/queries/past-event-reviews"

export async function PastReviewsSection() {
  const t = await getTranslations("pastReviews")
  const landingEventReviews = getLandingEventReviews(await getLocale())
  const dbReviews = await fetchPublishedPastEventReviews()
  const reviews = [...landingEventReviews, ...dbReviews]

  return (
    <section className="relative min-h-screen bg-[#fffdf7] px-5 pb-20 pt-28 text-[#171717] grain-overlay md:pt-32">
      <div className="container mx-auto max-w-6xl">
        <div className="mb-9 rounded-[2rem] border border-[#e5dfd3] bg-white/88 p-7 shadow-[0_16px_42px_rgba(44,55,35,0.10)] md:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6b8f4e]">{t("kicker")}</p>
          <h1 className="mt-4 font-display text-4xl font-bold leading-tight md:text-5xl">{t("title")}</h1>
          <div className="mt-3 h-2 w-40 rounded-[50%] border-b-[6px] border-[#f3cf55]" />
          <p className="mt-5 max-w-xl text-sm leading-[1.9] text-[#4c5148] md:text-base">{t("subtitle")}</p>
          <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold text-[#5f8549]">
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
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {reviews.map((review) => (
              <article key={review.id} className="overflow-hidden rounded-[1.5rem] border border-[#e5dfd3] bg-white shadow-[0_14px_34px_rgba(43,53,35,0.08)]">
                <div role="img" aria-label={review.title} className="aspect-[4/3] bg-cover bg-center" style={{ backgroundImage: cssImageUrl(review.cover_url) }} />
                <div className="p-5">
                  <p className="text-xs font-semibold tracking-[0.12em] text-[#6b8f4e]">{review.event_date ?? t("dateFallback")}</p>
                  <h2 className="mt-2 font-display text-xl font-semibold leading-snug">{review.title}</h2>
                  <p className="mt-3 text-sm leading-[1.8] text-[#4c5148]">{review.summary}</p>
                  {review.gallery_urls.length > 0 && (
                    <div className={`mt-4 grid gap-2 ${review.gallery_urls.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                      {review.gallery_urls.slice(0, 3).map((url) => (
                        <div key={url} className="aspect-square rounded-xl bg-cover bg-center" style={{ backgroundImage: cssImageUrl(url) }} />
                      ))}
                    </div>
                  )}
                  {review.source_url && (
                    <Link href={review.source_url} target="_blank" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-bamboo">
                      {t("source")}
                      <ExternalLink className="size-3.5" />
                    </Link>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
