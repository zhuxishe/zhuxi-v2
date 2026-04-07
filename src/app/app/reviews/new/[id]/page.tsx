import { notFound, redirect } from "next/navigation"
import { requirePlayer } from "@/lib/auth/player"
import { createClient } from "@/lib/supabase/server"
import { getTranslations } from "next-intl/server"
import { checkReviewExists } from "@/lib/queries/reviews"
import { MutualReviewForm } from "@/components/player/MutualReviewForm"

interface Props {
  params: Promise<{ id: string }>
}

export default async function NewReviewPage({ params }: Props) {
  const player = await requirePlayer()
  const t = await getTranslations("reviews")
  const { id: matchResultId } = await params

  // 加载 match_result 确定被评价者
  const supabase = await createClient()
  const { data: mr } = await supabase
    .from("match_results")
    .select("member_a_id, member_b_id")
    .eq("id", matchResultId)
    .single()

  if (!mr) notFound()

  // 确定搭档（对方 = reviewee）
  const revieweeId = mr.member_a_id === player.memberId ? mr.member_b_id : mr.member_a_id
  if (!revieweeId) notFound()

  // 防重复
  const alreadyReviewed = await checkReviewExists(matchResultId, player.memberId)
  if (alreadyReviewed) redirect("/app/matches")

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-1">{t("title")}</h1>
      <p className="text-sm text-muted-foreground mb-6">{t("subtitle")}</p>
      <MutualReviewForm
        reviewerId={player.memberId}
        revieweeId={revieweeId}
        matchResultId={matchResultId}
      />
    </div>
  )
}
