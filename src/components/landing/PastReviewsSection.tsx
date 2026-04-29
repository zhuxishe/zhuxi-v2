import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ExternalLink, Images } from "lucide-react"
import { cssImageUrl } from "@/lib/css-image-url"
import { fetchPublishedPastEventReviews } from "@/lib/queries/past-event-reviews"

export async function PastReviewsSection() {
  const t = await getTranslations("pastReviews")
  const reviews = await fetchPublishedPastEventReviews()

  return (
    <section className="relative min-h-screen bg-[#f2f0eb] px-5 pb-20 pt-28 md:pt-32">
      <div className="container mx-auto max-w-6xl">
        <div className="mb-10 rounded-[2rem] bg-[#1E3932] px-6 py-10 text-white shadow-[0_8px_24px_rgba(0,0,0,0.14)] md:px-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">{t("kicker")}</p>
          <h1 className="mt-4 font-display text-4xl font-bold leading-tight md:text-5xl">{t("title")}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/72 md:text-base">{t("subtitle")}</p>
        </div>

        {reviews.length === 0 ? (
          <div className="landing-card bg-white p-10 text-center">
            <Images className="mx-auto mb-4 size-9 text-bamboo" />
            <p className="font-display text-lg text-muted-foreground">{t("empty")}</p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {reviews.map((review) => (
              <article key={review.id} className="landing-card overflow-hidden bg-white">
                <div role="img" aria-label={review.title} className="aspect-[4/3] bg-cover bg-center" style={{ backgroundImage: cssImageUrl(review.cover_url) }} />
                <div className="p-5">
                  <p className="text-xs text-muted-foreground">{review.event_date ?? t("dateFallback")}</p>
                  <h2 className="mt-2 font-display text-xl font-semibold leading-snug">{review.title}</h2>
                  <p className="mt-3 text-sm leading-[1.8] text-muted-foreground">{review.summary}</p>
                  {review.gallery_urls.length > 0 && (
                    <div className="mt-4 grid grid-cols-3 gap-2">
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
