import { getLocale, getTranslations } from "next-intl/server"
import Link from "next/link"
import { ArrowLeft, Images } from "lucide-react"
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
        <Link href="/scripts" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-[#5f8549]">
          <ArrowLeft className="size-4" />
          返回活动介绍
        </Link>
        <div className="mb-5 rounded-[1.4rem] border border-[#e5dfd3] bg-white/88 p-5 shadow-[0_12px_30px_rgba(44,55,35,0.08)] md:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6b8f4e]">活动介绍</p>
          <p className="mt-3 text-sm leading-[1.9] text-[#4c5148] md:text-base">
            竹溪社主要面向于东京校园的留学生群体，力求在真实场景里，为大家提供更加自然认识新朋友的社交途径。
            竹溪社汇聚了众多有意思的社交活动，并将线下聚会、城市探索、剧本桌游、双人/多人匹配和跨校社群连接在一起。
            我们希望降低陌生人初次见面的压力：除了贯穿全场的破冰环节，竹溪社会在活动前提供详细的人数、地点、预算和流程等说明，活动中通过分组、任务、游戏或共同体验制造话题，活动后也保留继续认识、再次组局和反馈体验的空间。
            目前活动主要分为两类：“①大型活动”：适合想一次认识更多同学、体验多人游戏、感受社群氛围的人；
            “②社交剧本类”：适合希望在小范围、有主题、有任务的场景里慢慢熟悉彼此的人。
            无论你是外向、慢热、想找固定搭子，还是只是想从一场周末活动开始拓展生活圈，都可以在竹溪社找到更适合自己的参与方式。
          </p>
        </div>
        <div className="mb-5 rounded-[1.6rem] border border-[#e5dfd3] bg-white/88 p-5 shadow-[0_16px_42px_rgba(44,55,35,0.10)] md:mb-9 md:rounded-[2rem] md:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6b8f4e]">{t("kicker")}</p>
          <h1 className="mt-3 font-display text-3xl font-bold leading-tight md:mt-4 md:text-5xl">{t("title")}</h1>
          <div className="mt-2 h-2 w-32 rounded-[50%] border-b-[6px] border-[#f3cf55] md:mt-3 md:w-40" />
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
