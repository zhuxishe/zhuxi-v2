import { notFound, redirect } from "next/navigation"
import { requirePlayer } from "@/lib/auth/player"
import { getTranslations } from "next-intl/server"
import { checkReviewExists } from "@/lib/queries/reviews"
import { MutualReviewForm } from "@/components/player/MutualReviewForm"
import { GroupReviewSelector } from "@/components/player/GroupReviewSelector"

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ reviewee?: string }>
}

/** 用 admin client 获取匹配详情（绕过 RLS） */
async function fetchMatchForReview(matchResultId: string) {
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const supabase = createAdminClient()

  const { data } = await supabase
    .from("match_results")
    .select(`
      member_a_id, member_b_id, group_members
    `)
    .eq("id", matchResultId)
    .single()

  return data
}

/** 获取组员名字（admin client） */
async function fetchMemberNames(memberIds: string[]) {
  if (memberIds.length === 0) return []
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const supabase = createAdminClient()

  const { data } = await supabase
    .from("members")
    .select("id, member_identity (full_name, nickname)")
    .in("id", memberIds)

  return (data ?? []).map((m) => {
    const identity = Array.isArray(m.member_identity) ? m.member_identity[0] : m.member_identity
    return {
      id: m.id,
      name: (identity as Record<string, string> | null)?.full_name
        ?? (identity as Record<string, string> | null)?.nickname
        ?? "未知",
    }
  })
}

export default async function NewReviewPage({ params, searchParams }: Props) {
  const player = await requirePlayer()
  const t = await getTranslations("reviews")
  const { id: matchResultId } = await params
  const { reviewee: revieweeParam } = await searchParams

  const mr = await fetchMatchForReview(matchResultId)
  if (!mr) notFound()

  const groupMembers = mr.group_members as string[] | null
  const isGroup = Array.isArray(groupMembers) && groupMembers.length > 0

  if (isGroup) {
    // 多人组：需要选择评价谁
    const otherIds = groupMembers.filter((id) => id !== player.memberId)

    if (!revieweeParam || !otherIds.includes(revieweeParam)) {
      // 没选人或选的人不在组里 → 显示选人界面
      const members = await fetchMemberNames(otherIds)
      // 查哪些人已评价过
      const reviewedSet = new Set<string>()
      for (const m of members) {
        const done = await checkReviewExists(matchResultId, player.memberId)
        // 需要按 reviewee 查（checkReviewExists 查的是 match+reviewer 组合）
        // 这里用更精确的查询
        const { createAdminClient } = await import("@/lib/supabase/admin")
        const supabase = createAdminClient()
        const { data: existing } = await supabase
          .from("mutual_reviews")
          .select("id")
          .eq("match_result_id", matchResultId)
          .eq("reviewer_id", player.memberId)
          .eq("reviewee_id", m.id)
          .maybeSingle()
        if (existing) reviewedSet.add(m.id)
      }

      return (
        <div className="p-6">
          <h1 className="text-xl font-bold mb-1">{t("title")}</h1>
          <p className="text-sm text-muted-foreground mb-6">{t("selectReviewee")}</p>
          <GroupReviewSelector
            matchResultId={matchResultId}
            members={members}
            reviewedIds={[...reviewedSet]}
          />
        </div>
      )
    }

    // 已选人 → 检查是否已评价
    const alreadyReviewed = await checkReviewExistsPair(matchResultId, player.memberId, revieweeParam)
    if (alreadyReviewed) redirect(`/app/reviews/new/${matchResultId}`)

    const [revieweeName] = await fetchMemberNames([revieweeParam])
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold mb-1">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {t("subtitle")} — {revieweeName?.name ?? ""}
        </p>
        <MutualReviewForm
          reviewerId={player.memberId}
          revieweeId={revieweeParam}
          matchResultId={matchResultId}
        />
      </div>
    )
  }

  // 双人配对
  const revieweeId = mr.member_a_id === player.memberId ? mr.member_b_id : mr.member_a_id
  if (!revieweeId) notFound()

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

/** 精确检查某个 reviewer→reviewee 是否已评价 */
async function checkReviewExistsPair(matchResultId: string, reviewerId: string, revieweeId: string) {
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const supabase = createAdminClient()
  const { data } = await supabase
    .from("mutual_reviews")
    .select("id")
    .eq("match_result_id", matchResultId)
    .eq("reviewer_id", reviewerId)
    .eq("reviewee_id", revieweeId)
    .maybeSingle()
  return !!data
}
