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
          <div className="mt-3 space-y-2 text-sm leading-[1.9] text-[#4c5148] md:text-base">
            <p>
              大型活动是竹溪社面向更多成员开放的线下社交场景，形式包括欢迎会、桌游派对、BBQ、城市出游、节日聚会、户外团建和主题派对等。相比单纯把大家聚在一起聊天，我们更重视“在现场更多元交流”：通过自由分组、共同游戏、团队任务和工作人员引导，让每一位同学都可以自然的融入其中。
            </p>
            <p>
              竹溪社将定期举办（每周一次室外多人活动+每月一次大型活动）各类“大型活动”，适合想认识更多跨校同学、体验社群氛围、寻找固定玩伴或拓展东京生活圈的成员。推荐把它当作进入竹溪社的第一扇门：在热闹但有组织的场景里认识大家，再根据兴趣或相处节奏，继续参加之后的剧本活动、匹配活动或小规模组局。
            </p>
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
