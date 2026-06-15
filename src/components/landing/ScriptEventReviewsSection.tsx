import { getLocale, getTranslations } from "next-intl/server"
import { PastReviewCard } from "@/components/landing/PastReviewCard"
import { getLandingScriptEventReviews } from "@/lib/landing-activity-photos"

export async function ScriptEventReviewsSection() {
  const locale = await getLocale()
  const t = await getTranslations("pastReviews")
  const reviews = getLandingScriptEventReviews(locale)

  return (
    <section className="mb-8 rounded-[1.6rem] border border-[#e5dfd3] bg-white/88 p-5 shadow-[0_16px_42px_rgba(44,55,35,0.10)] md:p-8">
      <h2 className="font-display text-3xl font-bold leading-tight md:text-4xl">
        {locale === "ja" ? "公開シナリオ一覧" : "公开剧本库"}
      </h2>
      <div className="mt-3 h-2 w-40 rounded-[50%] border-b-[6px] border-[#f3cf55]" />
      <div className="mt-5 space-y-7">
        {reviews.map((review) => (
          <PastReviewCard key={review.id} review={review} sourceLabel={t("source")} photoUnitLabel={t("photoUnit")} framed={false} showPhotoCount={false} />
        ))}
      </div>
    </section>
  )
}
